import { build } from "esbuild";
import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = resolve(root, "apps/extension");
const outdir = resolve(app, "dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await Promise.all([
  build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: [resolve(app, "src/background.ts")],
    format: "esm",
    minify: false,
    outfile: resolve(outdir, "background.js"),
    platform: "browser",
    sourcemap: true,
    target: ["chrome132"],
  }),
  build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: [resolve(app, "src/content.tsx")],
    format: "iife",
    loader: { ".css": "text", ".png": "dataurl", ".svg": "text" },
    minify: false,
    outfile: resolve(outdir, "content.js"),
    platform: "browser",
    sourcemap: true,
    target: ["chrome132"],
  }),
  copyFile(resolve(app, "manifest.json"), resolve(outdir, "manifest.json")),
  cp(resolve(app, "icons"), resolve(outdir, "icons"), { recursive: true }),
]);

console.log(`Built extension at ${outdir}`);
