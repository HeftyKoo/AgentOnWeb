import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { CLAUDE_EVENTS, installClaudeHooks, mergeClaudeHooks, uninstallClaudeHooks } from "./claude-hooks.js";

let directory: string;
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); if (directory) await rm(directory, { recursive: true, force: true }); });

it("preserves settings and user hooks, upgrades only the integration, and uninstalls idempotently", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-claude-config-"));
  const original = { model: "custom", permissions: { ask: ["Bash"] }, disableAllHooks: true, hooks: {
    Stop: [{ matcher: "", hooks: [{ type: "command", command: "user-check" }] }],
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "keep-me" }, { type: "command", command: "old-path agent-event claude-code", statusMessage: "AgentOnWeb session status" }] }],
  } };
  const path = join(directory, "settings.json");
  await writeFile(path, JSON.stringify(original));
  vi.stubEnv("CLAUDE_CONFIG_DIR", directory);
  expect(await installClaudeHooks()).toBe(path);
  const installed = await readFile(path, "utf8");
  const value = JSON.parse(installed);
  expect(value).toMatchObject({ model: "custom", permissions: original.permissions, disableAllHooks: true });
  expect(value.hooks.Stop[0]).toEqual(original.hooks.Stop[0]);
  expect(value.hooks.PreToolUse[0]).toEqual({ matcher: "Bash", hooks: [{ type: "command", command: "keep-me" }] });
  for (const event of CLAUDE_EVENTS) expect(value.hooks[event].at(-1).hooks[0]).toMatchObject({ type: "command", timeout: 5, statusMessage: "AgentOnWeb session status" });
  expect(value.hooks.Notification.at(-1).matcher).toBe("permission_prompt|idle_prompt");
  expect(value.hooks.Stop.at(-1).hooks[0]).toMatchObject({ command: process.execPath, args: [expect.stringContaining("agent-hook.js"), "claude-code"] });
  expect((await readdir(directory)).filter(name => name.endsWith(".bak"))).toHaveLength(1);
  await installClaudeHooks();
  expect(await readFile(path, "utf8")).toBe(installed);
  await uninstallClaudeHooks();
  const removed = await readFile(path, "utf8");
  expect(JSON.parse(removed)).toEqual({ ...original, hooks: { Stop: original.hooks.Stop,
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "keep-me" }] }] } });
  await uninstallClaudeHooks();
  expect(await readFile(path, "utf8")).toBe(removed);
});

it("refuses malformed configuration without overwriting or backing it up", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-claude-invalid-"));
  const path = join(directory, "settings.json");
  for (const source of ["{broken", "[]", '{"hooks":{"Stop":"bad"}}', '{"hooks":{"Stop":[{}]}}']) {
    await writeFile(path, source);
    await expect(installClaudeHooks(directory)).rejects.toThrow();
    await expect(uninstallClaudeHooks(directory)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(source);
    expect(await readdir(directory)).toEqual(["settings.json"]);
  }
});

it("leaves unrelated and absent settings alone on uninstall", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-claude-absent-"));
  await uninstallClaudeHooks(directory);
  expect(await readdir(directory)).toEqual([]);
  const path = join(directory, "settings.json");
  await writeFile(path, '{ "model": "custom" }\n');
  await uninstallClaudeHooks(directory);
  expect(await readFile(path, "utf8")).toBe('{ "model": "custom" }\n');
  expect(mergeClaudeHooks({}, "aow")).toEqual(mergeClaudeHooks(mergeClaudeHooks({}, "aow"), "aow"));
});

it("resolves the reporter from its package when aow is invoked through a bin symlink", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-claude-symlink-"));
  vi.stubGlobal("process", { ...process, argv: [process.execPath, join(directory, "bin/aow")] });
  const path = await installClaudeHooks(directory);
  const configured = JSON.parse(await readFile(path, "utf8"));
  expect(configured.hooks.Stop.at(-1).hooks[0].args).toEqual([
    fileURLToPath(new URL("./agent-hook.js", import.meta.url)), "claude-code",
  ]);
});
