import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { configureNotify, removeNotify } from "./codex-notify.js";
import { cleanup } from "./cleanup.js";

export const CODEX_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Interrupt", "SessionEnd"] as const;
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export function mergeCodexHooks(value: unknown, command: string): object {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("hooks.json must contain an object.");
  const config = value as Record<string, unknown>;
  if (config.hooks !== undefined && (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks))) throw new Error("Invalid hooks configuration.");
  const hooks = { ...(config.hooks as Record<string, unknown> ?? {}) };
  for (const event of CODEX_EVENTS) {
    const groups = hooks[event] ?? [];
    if (!Array.isArray(groups)) throw new Error(`Invalid ${event} hooks.`);
    // Preserve all user groups; replace only our explicitly named integration.
    hooks[event] = [...groups.filter(group => group?.hooks?.length !== 1 || group.hooks[0]?.statusMessage !== "AgentOnWeb session status"),
      { hooks: [{ type: "command", command, timeout: 3, statusMessage: "AgentOnWeb session status" }] }];
  }
  return { ...config, hooks };
}
const codexDirectory = () => process.env.CODEX_HOME || join(homedir(), ".codex");
async function readOptional(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
async function saveConfig(path: string, source: string | undefined, updated: string): Promise<void> {
  if (source === updated) return;
  await mkdir(dirname(path), { recursive: true });
  if (source !== undefined) await copyFile(path, `${path}.agentonweb-${Date.now()}.bak`);
  const temp = `${path}.agentonweb.tmp`;
  await writeFile(temp, updated, { mode: 0o600 });
  await rename(temp, path);
}
export async function installCodexHooks(directory = codexDirectory()): Promise<string> {
  const path = join(directory, "hooks.json");
  const source = await readOptional(path);
  const value: unknown = source === undefined ? {} : JSON.parse(source);
  const command = `${quote(process.execPath)} ${quote(resolve(process.argv[1]!))} agent-event`;
  const updated = mergeCodexHooks(value, command);
  if (JSON.stringify(value) !== JSON.stringify(updated)) await saveConfig(path, source, JSON.stringify(updated, null, 2) + "\n");
  const configPath = join(directory, "config.toml");
  const config = await readOptional(configPath);
  let updatedConfig: string;
  try { updatedConfig = configureNotify(config ?? "", process.execPath, resolve(process.argv[1]!)); }
  catch {
    console.warn(`Skipped Codex notify configuration: could not safely parse/update ${configPath}. Hooks are installed; completion notifications need a valid notify configuration. Fix the file and rerun aow codex-hooks install.`);
    return path;
  }
  await saveConfig(configPath, config, updatedConfig);
  return path;
}

export async function uninstallCodexHooks(directory = codexDirectory()): Promise<void> {
  await cleanup([
    () => removeHooks(directory),
    async () => {
      const configPath = join(directory, "config.toml");
      const config = await readOptional(configPath);
      if (config !== undefined) await saveConfig(configPath, config, removeNotify(config));
    },
  ], 'Codex integration cleanup is incomplete. Fix the reported configuration errors and retry.');
}

async function removeHooks(directory: string): Promise<void> {
  const path = join(directory, "hooks.json");
  const source = await readOptional(path);
  if (source !== undefined) {
    const value = JSON.parse(source);
    // Validate the same structure accepted by the installer before editing it.
    mergeCodexHooks(value, "");
    for (const event of CODEX_EVENTS) {
      const groups = value.hooks?.[event];
      if (!groups) continue;
      const remaining = groups.filter((group: any) => group?.hooks?.length !== 1 || group.hooks[0]?.statusMessage !== "AgentOnWeb session status");
      if (remaining.length === groups.length) continue;
      if (remaining.length) value.hooks[event] = remaining;
      else delete value.hooks[event];
    }
    if (JSON.stringify(value) !== JSON.stringify(JSON.parse(source))) await saveConfig(path, source, JSON.stringify(value, null, 2) + "\n");
  }
}

/** Observational hook: no stdout, permission decision, or effect outside AOW terminals. */
export async function reportCodexEvent(): Promise<void> {
  if (!process.env.AOW_AGENT_ENDPOINT || !process.env.AOW_AGENT_TOKEN) return;
  let body = "";
  for await (const chunk of process.stdin) { body += chunk; if (body.length > 4_194_304) return; }
  await reportCodexInput(JSON.parse(body));
}
export async function reportCodexInput(input: any): Promise<void> {
  const endpoint = process.env.AOW_AGENT_ENDPOINT;
  const token = process.env.AOW_AGENT_TOKEN;
  if (!endpoint || !token) return;
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/agent-event") return;
  // Do not forward commands, tool output, or assistant responses to presentation.
  const payload = { session_id: input.session_id, hook_event_name: input.hook_event_name, turn_id: input.turn_id,
    agent_id: input.agent_id, source: input.source, cwd: input.cwd, prompt: typeof input.prompt === "string" ? input.prompt.slice(0, 160) : undefined,
    tool_name: input.tool_name, tool_use_id: input.tool_use_id,
    tool_input: { description: typeof input.tool_input?.description === "string" ? input.tool_input.description.slice(0, 500) : undefined } };
  await fetch(url, { method: "POST", redirect: "error", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(1200) });
}
