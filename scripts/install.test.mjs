import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('runs explicit setup after npm and never after a failed install, including paths with spaces', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aow installer '));
  try {
    const bin = join(root, 'bin'); await mkdir(bin);
    const fake = async (name, body) => writeFile(join(bin, name), '#!/bin/sh\n' + body, { mode: 0o700 });
    await fake('uname', 'echo Darwin\n'); await fake('id', 'echo 501\n'); await fake('node', 'exit 0\n');
    await fake('npm', 'if [ "$1" = prefix ]; then echo "$TEST_PREFIX"; else echo install >> "$TEST_LOG"; exit "${TEST_INSTALL_EXIT:-0}"; fi\n');
    await fake('aow', 'echo "$1" >> "$TEST_LOG"\n');
    const log = join(root, 'calls');
    const env = { ...process.env, PATH: bin + ':/usr/bin:/bin', TEST_PREFIX: root, TEST_LOG: log };
    expect(spawnSync('/bin/sh', [resolve('scripts/install.sh')], { env }).status).toBe(0);
    expect(await readFile(log, 'utf8')).toBe('install\nsetup\n');
    await writeFile(log, '');
    expect(spawnSync('/bin/sh', [resolve('scripts/install.sh')], { env: { ...env, TEST_INSTALL_EXIT: '1' } }).status).toBe(1);
    expect(await readFile(log, 'utf8')).toBe('install\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});
