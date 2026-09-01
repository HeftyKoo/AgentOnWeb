import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, utimes } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildExtension } from "./build-extension.mjs";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = resolve(root, "release");
const unpackedDirectory = resolve(releaseDirectory, "extension-unpacked");
const manifest = JSON.parse(await readFile(resolve(root, "apps/extension/manifest.json"), "utf8"));
const archive = resolve(releaseDirectory, `overcode-extension-${manifest.version}.zip`);

await mkdir(releaseDirectory, { recursive: true });
await rm(archive, { force: true });
await buildExtension({ release: true, outdir: unpackedDirectory });

async function archiveFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await archiveFiles(path));
    else files.push(path);
  }
  return files;
}

const files = await archiveFiles(unpackedDirectory);
const fixedTime = new Date("2000-01-01T00:00:00.000Z");
await Promise.all(files.map((file) => utimes(file, fixedTime, fixedTime)));
await execute("zip", ["-X", "-q", archive, ...files.map((file) => relative(unpackedDirectory, file))], {
  cwd: unpackedDirectory,
  env: { ...process.env, TZ: "UTC" },
});
console.log(archive);
