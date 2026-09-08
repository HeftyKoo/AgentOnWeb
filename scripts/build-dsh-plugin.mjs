import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageDirectory = resolve(import.meta.dirname, "../packages/dsh-surface-plugin");
const sourceDirectory = resolve(packageDirectory, "src");
const outputDirectory = resolve(packageDirectory, "lib");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(sourceDirectory, "host.ts")],
    outfile: resolve(outputDirectory, "host.js"),
    bundle: true, platform: "node", format: "esm", target: "node22",
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    external: ["bufferutil", "utf-8-validate"],
  }),
  build({
    entryPoints: [resolve(sourceDirectory, "index.ts")],
    outfile: resolve(outputDirectory, "index.js"),
    bundle: false, platform: "node", format: "esm", target: "node22",
  }),
]);

const clientBuild = await build({
  entryPoints: [resolve(sourceDirectory, "client.ts")],
  bundle: true,
  external: ["react"],
  format: "cjs",
  platform: "browser",
  target: "chrome132",
  write: false,
});
const clientModule = clientBuild.outputFiles[0]?.text;
if (!clientModule) throw new Error("DSH client build emitted no JavaScript.");
const clientBundle = `window.__ModuleLoader__.load({\n  id: "@agentonweb/dsh-surface",\n  factory: (require) => {\n    const module = { exports: {} };\n    const exports = module.exports;\n${clientModule.split("\n").map((line) => `    ${line}`).join("\n")}\n    return module.exports;\n  }\n});\n`;
await writeFile(resolve(outputDirectory, "client.js"), clientBundle);
