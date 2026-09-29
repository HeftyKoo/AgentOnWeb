import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { parse } from "smol-toml";
import { installCodexHooks, uninstallCodexHooks } from "./codex-hooks.js";

afterEach(() => vi.restoreAllMocks());

it("still restores notify when hooks.json is malformed, leaving the broken file untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-hooks-broken-"));
  try {
    const config = 'notify = ["python3", "my.py"]\nmodel = "mine"\n';
    await writeFile(join(directory, "config.toml"), config);
    await installCodexHooks(directory);
    await writeFile(join(directory, "hooks.json"), '{broken');
    await expect(uninstallCodexHooks(directory)).rejects.toBeInstanceOf(AggregateError);
    expect(await readFile(join(directory, "hooks.json"), "utf8")).toBe('{broken');
    expect(parse(await readFile(join(directory, "config.toml"), "utf8"))).toEqual(parse(config));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("uninstalls only owned hooks and restores notify without touching later settings; repeat operations are no-ops", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-hooks-"));
  try {
    const userHook = { hooks: [{ type: "command", command: "my hook" }] };
    await writeFile(join(directory, "hooks.json"), JSON.stringify({ custom: true, hooks: { SessionStart: [userHook] } }));
    const config = '# Mine\nnotify = ["python3", "my.py"]\nmodel = "mine"\n';
    await writeFile(join(directory, "config.toml"), config);
    await installCodexHooks(directory);
    const before = await readdir(directory);
    await installCodexHooks(directory);
    expect(await readdir(directory)).toEqual(before);
    await writeFile(join(directory, "config.toml"), (await readFile(join(directory, "config.toml"), "utf8")) + 'other = true\n');
    await uninstallCodexHooks(directory);
    expect(JSON.parse(await readFile(join(directory, "hooks.json"), "utf8"))).toEqual({ custom: true, hooks: { SessionStart: [userHook] } });
    expect(parse(await readFile(join(directory, "config.toml"), "utf8"))).toEqual(parse(config + 'other = true\n'));
    const after = await readdir(directory);
    await uninstallCodexHooks(directory);
    expect(await readdir(directory)).toEqual(after);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("installs hooks even when notify TOML cannot be parsed, without changing that file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-hooks-"));
  try {
    const source = 'notify = [\n';
    await writeFile(join(directory, "config.toml"), source);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(installCodexHooks(directory)).resolves.toBe(join(directory, "hooks.json"));
    expect(JSON.parse(await readFile(join(directory, "hooks.json"), "utf8")).hooks.SessionStart).toHaveLength(1);
    expect(await readFile(join(directory, "config.toml"), "utf8")).toBe(source);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("notify"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
