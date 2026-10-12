import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(await readFile(resolve(root, "release-contract.json"), "utf8"));
const release = resolve(root, "release");
const firefox = resolve(root, "apps/extension/.output/firefox-mv2");
const manifest = JSON.parse(await readFile(resolve(firefox, "manifest.json"), "utf8"));
if (manifest.version !== contract.extensionVersion || manifest.manifest_version !== 2) {
  throw new Error("Firefox build does not match the release contract.");
}

async function filesIn(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else files.push(path);
  }
  return files;
}

const files = await filesIn(firefox);
await Promise.all(files.map(file => utimes(file, new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"))));
const firefoxArchive = resolve(release, contract.artifacts.firefoxExtension);
await rm(firefoxArchive, { force: true });
await execute("zip", ["-X", "-q", firefoxArchive, ...files.map(file => relative(firefox, file))], {
  cwd: firefox, env: { ...process.env, TZ: "UTC" },
});

// Run after committing: the source submitted to AMO must be the tagged source.
const dirty = await execute("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root });
if (dirty.stdout.trim()) throw new Error("Commit tracked source before packaging browser release assets.");
await execute("git", ["archive", "--format=zip", `--output=${resolve(release, contract.artifacts.extensionSource)}`, "HEAD"], { cwd: root });
const names = [contract.artifacts.extension, contract.artifacts.firefoxExtension, contract.artifacts.extensionSource];
const sums = await Promise.all(names.map(async name => `${createHash("sha256").update(await readFile(resolve(release, name))).digest("hex")}  ${name}`));
await writeFile(resolve(release, "browser-SHA256SUMS"), sums.join("\n") + "\n");
console.log(sums.join("\n"));
