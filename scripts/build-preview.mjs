import { build } from "esbuild";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
await build({
  absWorkingDir: root,
  bundle: true,
  entryPoints: [resolve(root, "apps/extension/src/preview.tsx")],
  format: "iife",
  loader: { ".css": "text", ".png": "dataurl", ".svg": "text" },
  minify: false,
  outfile: resolve(root, "apps/extension/preview/preview.js"),
  platform: "browser",
  sourcemap: true,
  target: ["chrome132"],
});
console.log("Built Overcode UI preview");
