import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "apps/safari/AgentOnWeb/AgentOnWeb/Resources/Demo");
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root, entryPoints: ["apps/extension/src/demo.ts"], bundle: true,
  format: "iife", platform: "browser", target: "safari18.4", minify: true,
  loader: { ".css": "text", ".svg": "text", ".png": "dataurl" },
  outfile: resolve(output, "demo.js"),
});
await writeFile(resolve(output, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"><title>AgentOnWeb Interactive Demo</title></head><body><div id="demo"></div><script src="demo.js"></script></body></html>`);
console.log("Built self-contained Safari app demo.");
