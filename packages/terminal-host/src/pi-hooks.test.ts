import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { installPiExtension, uninstallPiExtension } from "./pi-hooks.js";

let directory = "";
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); if (directory) await rm(directory, { recursive: true, force: true }); });

it("installs only its extension, preserves settings and other extensions, and reinstalls idempotently", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-pi-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  await mkdir(join(directory, "extensions"));
  const settings = '{ "model": "user-model", "extensions": ["./custom.ts"] }\n';
  await writeFile(join(directory, "settings.json"), settings);
  await writeFile(join(directory, "extensions", "custom.ts"), "export default () => {};\n");
  // The npm bin symlink must not determine the extension's package location.
  vi.stubGlobal("process", { ...process, argv: [process.execPath, "/some/npm/bin/aow"] });
  const path = await installPiExtension();
  const source = await readFile(path, "utf8");
  expect(source).toContain(JSON.stringify(fileURLToPath(new URL("./pi-extension.js", import.meta.url))));
  await installPiExtension();
  expect(await readFile(path, "utf8")).toBe(source);
  expect(await readdir(join(directory, "extensions"))).toEqual(["agentonweb.ts", "custom.ts"]);
  await uninstallPiExtension();
  await uninstallPiExtension();
  expect(await readFile(join(directory, "settings.json"), "utf8")).toBe(settings);
  expect(await readFile(join(directory, "extensions", "custom.ts"), "utf8")).toBe("export default () => {};\n");
});

it("refuses to replace or remove an unrelated file with the same name", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-pi-collision-"));
  await mkdir(join(directory, "extensions"));
  const path = join(directory, "extensions", "agentonweb.ts");
  await writeFile(path, "export default () => {};\n");
  await expect(installPiExtension(directory)).rejects.toThrow("unrelated Pi extension");
  await expect(uninstallPiExtension(directory)).rejects.toThrow("unrelated Pi extension");
  expect(await readFile(path, "utf8")).toBe("export default () => {};\n");
});

it("backs up an older integration when its package path changes", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-pi-upgrade-"));
  await mkdir(join(directory, "extensions"));
  const path = join(directory, "extensions", "agentonweb.ts");
  const previous = '// AgentOnWeb session status\nexport { default } from "/old/package/pi-extension.js";\n';
  await writeFile(path, previous);
  await installPiExtension(directory);
  const backup = (await readdir(join(directory, "extensions"))).find(name => name.endsWith(".bak"))!;
  expect(await readFile(join(directory, "extensions", backup), "utf8")).toBe(previous);
  await uninstallPiExtension(directory);
  expect(await readdir(join(directory, "extensions"))).toEqual([backup]);
});

it("does not create an agent directory when uninstalling an absent extension", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-pi-absent-"));
  await uninstallPiExtension(join(directory, "absent"));
  expect(await readdir(directory)).toEqual([]);
});

it("expands the agent directory's tilde exactly as Pi does", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-pi-tilde-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", "~/" + relative(homedir(), directory));
  expect(await installPiExtension()).toBe(join(directory, "extensions", "agentonweb.ts"));
  await uninstallPiExtension();
  expect(await readdir(join(directory, "extensions"))).toEqual([]);
});
