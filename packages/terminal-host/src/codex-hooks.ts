import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
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
  const command = `${quote(process.execPath)} ${quote(fileURLToPath(new URL("./agent-hook.js", import.meta.url)))} codex`;
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

export { reportAgentEvent as reportCodexEvent, reportAgentInput as reportCodexInput } from "./agent-events.js";
