import { build } from 'esbuild';
import { cp, mkdir, chmod } from 'node:fs/promises';
await import('./build-terminal-surface.mjs');
const root = new URL('../packages/terminal-host/', import.meta.url);
await mkdir(new URL('lib/', root), { recursive: true });
await build({ entryPoints: [new URL('src/cli.ts', root).pathname], bundle: true, platform: 'node', format: 'esm', packages: 'bundle', external: ['node-pty', '@xterm/headless', '@xterm/addon-serialize', 'ws'], outfile: new URL('lib/cli.js', root).pathname });
await cp(new URL('../apps/terminal-surface/dist/', import.meta.url), new URL('lib/public/', root), { recursive: true });
await chmod(new URL('lib/cli.js', root), 0o755);
