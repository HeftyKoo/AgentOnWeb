import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, utimes } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { buildExtension } from "./build-extension.mjs";
import { checkSafariPrivacy } from "./check-safari-privacy.mjs";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const contract = JSON.parse(await readFile(resolve(root, "release-contract.json"), "utf8"));
const project = resolve(root, "apps/safari/AgentOnWeb/AgentOnWeb.xcodeproj/project.pbxproj");
const projectText = await readFile(project, "utf8");
await checkSafariPrivacy(root);
const versions = [...projectText.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1]);
if (versions.length !== 4 || versions.some((version) => version !== contract.version)) {
  throw new Error("Safari target versions must match release-contract.json before packaging.");
}
const built = await buildExtension({ browser: "safari" });
const resources = resolve(root, "apps/safari/AgentOnWeb/AgentOnWeb Extension/Resources");
await rm(resources, { recursive: true, force: true });
await cp(built, resources, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(resources, "manifest.json"), "utf8"));
if (manifest.version !== contract.version || manifest.manifest_version !== 2) {
  throw new Error("Unexpected Safari manifest version.");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unsupported Safari resource: ${path}`);
  }
  return files;
}
const files = await listFiles(resources);
if (files.some((file) => file.endsWith(".map"))) throw new Error("Safari release must not contain source maps.");
const archive = resolve(root, `release/safari/agentonweb-safari-extension-${contract.version}.zip`);
await mkdir(resolve(root, "release/safari"), { recursive: true });
await rm(archive, { force: true });
await Promise.all(files.map((file) => utimes(file, new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"))));
await execute("zip", ["-X", "-q", archive, ...files.map((file) => relative(resources, file))], { cwd: resources, env: { ...process.env, TZ: "UTC" } });
console.log(`Prepared Safari Xcode resources and ${archive}`);
console.log(`${createHash("sha256").update(await readFile(archive)).digest("hex")}  ${relative(root, archive)}`);
