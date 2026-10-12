import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const CLAUDE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "Notification", "Stop", "StopFailure", "SessionEnd"] as const;
const marker = "AgentOnWeb session status";
const directory = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const ours = (hook: any) => hook?.type === "command" && hook.statusMessage === marker;

function editHooks(value: unknown, command?: string, args?: string[]): object {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("settings.json must contain an object.");
  const config = value as Record<string, unknown>;
  if (config.hooks !== undefined && (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks))) throw new Error("Invalid Claude Code hooks configuration.");
  const hooks = { ...(config.hooks as Record<string, unknown> ?? {}) };
  for (const event of CLAUDE_EVENTS) {
    const groups = hooks[event] ?? [];
    if (!Array.isArray(groups) || groups.some(group => !group || typeof group !== "object" || !Array.isArray(group.hooks))) throw new Error(`Invalid ${event} hooks.`);
    const remaining = groups.flatMap(group => {
      const kept = group.hooks.filter((hook: unknown) => !ours(hook));
      return kept.length === group.hooks.length ? [group] : kept.length ? [{ ...group, hooks: kept }] : [];
    });
    if (command) remaining.push({ ...(event === "Notification" ? { matcher: "permission_prompt|idle_prompt" } : {}),
      hooks: [{ type: "command", command, ...(args ? { args } : {}), timeout: 5, statusMessage: marker }] });
    if (remaining.length || groups.length === 0 && event in hooks) hooks[event] = remaining;
    else delete hooks[event];
  }
  return { ...config, ...(config.hooks !== undefined || command ? { hooks } : {}) };
}

export const mergeClaudeHooks = (value: unknown, command: string): object => editHooks(value, command);

async function update(directory: string, command?: string, args?: string[]): Promise<string> {
  const path = join(directory, "settings.json");
  let source: string | undefined;
  try { source = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (source === undefined && !command) return path;
  const value: unknown = source === undefined ? {} : JSON.parse(source);
  const updated = editHooks(value, command, args);
  if (JSON.stringify(value) === JSON.stringify(updated)) return path;
  await mkdir(dirname(path), { recursive: true });
  if (source !== undefined) await copyFile(path, `${path}.agentonweb-${Date.now()}.bak`);
  const temp = `${path}.agentonweb.tmp`;
  await writeFile(temp, JSON.stringify(updated, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
  return path;
}

export async function installClaudeHooks(configDirectory = directory()): Promise<string> {
  // npm's aow bin symlink is preserved in argv[1]; the module URL identifies
  // the actual package directory, including when this module is bundled in cli.js.
  return update(configDirectory, process.execPath, [fileURLToPath(new URL("./agent-hook.js", import.meta.url)), "claude-code"]);
}

export async function uninstallClaudeHooks(configDirectory = directory()): Promise<void> {
  await update(configDirectory);
}
