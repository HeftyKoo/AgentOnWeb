import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../apps/terminal-surface/', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
await build({ entryPoints: [new URL('src/main.ts', root).pathname], bundle: true, format: 'esm', outfile: new URL('dist/main.js', root).pathname });
await copyFile(new URL('src/index.html', root), new URL('dist/index.html', root));
