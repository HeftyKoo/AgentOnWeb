import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = resolve(root, "release");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

// pnpm resolves workspace dependencies concurrently, so their order in the
// packed manifest can vary. Canonicalize those maps in the actual release tar.
async function normalizePackedDependencyOrder(archive) {
  const tar = gunzipSync(await readFile(archive));
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/s, "");
    if (!name) break;
    const size = Number.parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/s, "").trim(), 8);
    if (name === "package/package.json") {
      const start = offset + 512;
      const original = tar.subarray(start, start + size).toString();
      const manifest = JSON.parse(original);
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        if (manifest[field]) manifest[field] = Object.fromEntries(Object.entries(manifest[field]).sort(([a], [b]) => a.localeCompare(b)));
      }
      const normalized = Buffer.from(JSON.stringify(manifest, null, 2) + (original.endsWith("\n") ? "\n" : ""));
      if (normalized.length !== size) throw new Error("Packed manifest normalization unexpectedly changed its size.");
      normalized.copy(tar, start);
      await writeFile(archive, gzipSync(tar, { level: 9 }));
      return;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("Packed plugin manifest is missing.");
}
const contract = await readJson(resolve(root, "release-contract.json"));
const rootPackage = await readJson(resolve(root, "package.json"));
const extensionPackage = await readJson(resolve(root, "apps/extension/package.json"));
const pluginPackage = await readJson(resolve(root, "packages/dsh-surface-plugin/package.json"));
const protocol = await import(pathToFileURL(resolve(root, "packages/connector-contract/dist/index.js")));

const versions = [rootPackage.version, extensionPackage.version, pluginPackage.version, contract.version];
if (new Set(versions).size !== 1) throw new Error(`Release versions differ: ${versions.join(", ")}`);
if (pluginPackage.private !== false || pluginPackage.publishConfig?.access !== "public") {
  throw new Error("The DSH plugin is not configured as a public npm package.");
}
if (pluginPackage.dsh?.bundle?.patch !== "./cordis.patch.yml") throw new Error("The DSH bundle patch is missing.");
if (pluginPackage.agentonweb?.dsh !== contract.dsh || pluginPackage.agentonweb?.connectorProtocol !== contract.connectorProtocol) {
  throw new Error("Plugin compatibility metadata differs from release-contract.json.");
}
if (protocol.PROTOCOL_VERSION !== contract.connectorProtocol) throw new Error("Connector protocol version differs from release-contract.json.");

await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });
await execute("pnpm", ["--filter", "@agentonweb/dsh-surface", "pack", "--pack-destination", releaseDirectory], { cwd: root });
await execute("node", [resolve(root, "scripts/package-extension.mjs")], { cwd: root });
const generatedManifest = await readJson(resolve(releaseDirectory, "extension-unpacked/manifest.json"));
if (generatedManifest.version !== contract.version || generatedManifest.manifest_version !== 3) {
  throw new Error("The generated Chrome manifest differs from the release contract.");
}

const pluginArchive = resolve(releaseDirectory, `agentonweb-dsh-surface-${contract.version}.tgz`);
const extensionArchive = resolve(releaseDirectory, `agentonweb-extension-${contract.version}.zip`);
await normalizePackedDependencyOrder(pluginArchive);
const temporary = await mkdtemp(resolve(tmpdir(), "agentonweb-release-audit-"));
try {
  const firstPluginDigest = createHash("sha256").update(await readFile(pluginArchive)).digest("hex");
  const firstExtensionDigest = createHash("sha256").update(await readFile(extensionArchive)).digest("hex");
  const reproductionDirectory = resolve(temporary, "reproduction");
  await mkdir(reproductionDirectory, { recursive: true });
  await execute("pnpm", ["--filter", "@agentonweb/dsh-surface", "pack", "--pack-destination", reproductionDirectory], { cwd: root });
  await execute("node", [resolve(root, "scripts/package-extension.mjs")], { cwd: root });
  const reproducedPlugin = resolve(reproductionDirectory, basename(pluginArchive));
  await normalizePackedDependencyOrder(reproducedPlugin);
  const reproducedPluginDigest = createHash("sha256").update(await readFile(reproducedPlugin)).digest("hex");
  const reproducedExtensionDigest = createHash("sha256").update(await readFile(extensionArchive)).digest("hex");
  const drift = [];
  if (firstPluginDigest !== reproducedPluginDigest) {
    drift.push(`DSH plugin ${firstPluginDigest} != ${reproducedPluginDigest}`);
  }
  if (firstExtensionDigest !== reproducedExtensionDigest) {
    drift.push(`Chrome extension ${firstExtensionDigest} != ${reproducedExtensionDigest}`);
  }
  if (drift.length) throw new Error(`Release artifacts are not reproducible from the same checkout:\n${drift.join("\n")}`);

  const tarListing = (await execute("tar", ["-tf", pluginArchive])).stdout.trim().split("\n").sort();
  const expectedTar = [
    "package/LICENSE",
    "package/cordis.patch.yml",
    "package/lib/client.js",
    "package/lib/host.js",
    "package/lib/index.js",
    "package/package.json",
  ].sort();
  if (JSON.stringify(tarListing) !== JSON.stringify(expectedTar)) throw new Error(`Unexpected plugin archive contents:\n${tarListing.join("\n")}`);
  await execute("tar", ["-xf", pluginArchive, "-C", temporary]);
  const imported = await import(pathToFileURL(resolve(temporary, "package/lib/index.js")));
  if (typeof imported.apply !== "function" || !Array.isArray(imported.inject)) throw new Error("Packed DSH plugin entry is invalid.");

  const zipListing = (await execute("unzip", ["-Z1", extensionArchive])).stdout.trim().split("\n")
    .filter((entry) => entry && !entry.endsWith("/"))
    .sort();
  const expectedZip = [
    "background.js", "content-scripts/agentonweb.js", "manifest.json",
    "agentonweb-16.png", "agentonweb-32.png", "agentonweb-48.png", "agentonweb-128.png",
  ].sort();
  if (JSON.stringify(zipListing) !== JSON.stringify(expectedZip)) throw new Error(`Unexpected extension archive contents:\n${zipListing.join("\n")}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

const hashes = [];
for (const artifact of [pluginArchive, extensionArchive]) {
  const digest = createHash("sha256").update(await readFile(artifact)).digest("hex");
  hashes.push(`${digest}  ${basename(artifact)}`);
}
await writeFile(resolve(releaseDirectory, "SHA256SUMS"), `${hashes.join("\n")}\n`);
console.log(`Release audit passed for ${contract.version}:\n${hashes.join("\n")}`);
