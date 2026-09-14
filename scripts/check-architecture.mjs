import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisScript = fileURLToPath(import.meta.url);
const root = resolve(dirname(thisScript), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const packages = {
  extension: await readJson("apps/extension/package.json"),
  contract: await readJson("packages/connector-contract/package.json"),
  host: await readJson("packages/connector-host/package.json"),
  surface: await readJson("packages/dsh-surface-plugin/package.json"),
};

const expectedNames = {
  extension: "@agentonweb/extension",
  contract: "@agentonweb/connector-contract",
  host: "@agentonweb/connector-host",
  surface: "@agentonweb/dsh-surface",
};

for (const [key, expected] of Object.entries(expectedNames)) {
  if (packages[key].name !== expected) throw new Error(`${key} must be named ${expected}.`);
}

const agentonwebDependencies = (manifest) => Object.keys({
  ...manifest.dependencies,
  ...manifest.optionalDependencies,
  ...manifest.peerDependencies,
}).filter((name) => name.startsWith("@agentonweb/")).sort();

const expectedRuntimeEdges = {
  extension: [expectedNames.contract],
  contract: [],
  host: [expectedNames.contract],
  surface: [],
};

for (const [key, expected] of Object.entries(expectedRuntimeEdges)) {
  const actual = agentonwebDependencies(packages[key]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${packages[key].name} runtime edges must be [${expected.join(", ")}], got [${actual.join(", ")}].`);
  }
}

const surfaceBuildEdges = Object.keys(packages.surface.devDependencies ?? {}).filter((name) => name.startsWith("@agentonweb/")).sort();
const expectedSurfaceBuildEdges = [expectedNames.contract, expectedNames.host].sort();
if (JSON.stringify(surfaceBuildEdges) !== JSON.stringify(expectedSurfaceBuildEdges)) {
  throw new Error(`The DSH surface build edges must be [${expectedSurfaceBuildEdges.join(", ")}].`);
}

const deprecatedDirectories = [
  "packages/core",
  "packages/local-bridge",
  "packages/overlay-ui",
  "packages/runtime-api",
  "packages/runtime-connector",
  "packages/runtime-deepseek-harness",
  "packages/shared-protocol",
];

for (const directory of deprecatedDirectories) {
  try {
    await access(resolve(root, directory));
    throw new Error(`Deprecated package directory still exists: ${directory}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const sourceRoots = ["apps", "packages", "scripts"];
const checkedExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const deprecatedNames = ["@agentonweb/runtime-connector", "@agentonweb/shared-protocol"];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["dist", "dist-types", "lib", "node_modules", "preview"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (checkedExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

for (const sourceRoot of sourceRoots) {
  for (const path of await sourceFiles(resolve(root, sourceRoot))) {
    if (path === thisScript) continue;
    const source = await readFile(path, "utf8");
    for (const deprecatedName of deprecatedNames) {
      if (source.includes(deprecatedName)) throw new Error(`${relative(root, path)} imports deprecated package ${deprecatedName}.`);
    }
    if (/from\s+["'][^"']*packages\/[^"']*\/src(?:\/|["'])/u.test(source)) {
      throw new Error(`${relative(root, path)} reaches across a package's source boundary.`);
    }
  }
}

const contract = await readJson("release-contract.json");
const expectedArtifacts = {
  extension: `agentonweb-extension-${contract.extensionVersion}.zip`,
  dshPlugin: `agentonweb-dsh-surface-${contract.pluginVersion}.tgz`,
};
if (JSON.stringify(contract.artifacts) !== JSON.stringify(expectedArtifacts)) {
  throw new Error("release-contract.json artifact names must be derived from their own release versions.");
}

console.log("Architecture contract passed: four packages, inward dependencies, no legacy seams.");
