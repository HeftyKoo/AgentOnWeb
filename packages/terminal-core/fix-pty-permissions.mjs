// node-pty 1.1.0's macOS prebuilt spawn helper can be installed without +x.
import { createRequire } from 'node:module';
import { chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('node-pty/package.json'));
  await chmod(join(root, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
