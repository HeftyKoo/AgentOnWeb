import { build } from "esbuild";
import { resolve } from "node:path";
await build({
  entryPoints: [resolve(import.meta.dirname, "../packages/dsh-surface-plugin/src/host.ts")],
  outfile: resolve(import.meta.dirname, "../packages/dsh-surface-plugin/lib/host.js"),
  bundle: true, platform: "node", format: "esm", target: "node22",
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  external: ["bufferutil", "utf-8-validate"],
});
