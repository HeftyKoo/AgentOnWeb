import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'aow installer '));
  try {
    const bin = join(root, 'bin');
    const installedBin = join(root, '.local/bin');
    await mkdir(bin); await mkdir(installedBin, { recursive: true });
    const fake = async (name, body) => writeFile(join(bin, name), '#!/bin/sh\n' + body, { mode: 0o700 });
    await fake('uname', 'echo "${TEST_OS:-Darwin}"\n');
    await fake('id', 'echo "${TEST_UID:-501}"\n');
    await fake('node', 'exit "${TEST_NODE_EXIT:-0}"\n');
    await fake('npm', 'test "$AOW_SKIP_SETUP" = 1 || exit 2; echo "$*" >> "$TEST_ARGS"; cat >/dev/null; echo install >> "$TEST_LOG"; exit "${TEST_INSTALL_EXIT:-0}"\n');
    await writeFile(join(installedBin, 'aow'), '#!/bin/sh\ncat >/dev/null\necho "$1" >> "$TEST_LOG"\nexit "${TEST_SETUP_EXIT:-0}"\n', { mode: 0o700 });
    const log = join(root, 'calls');
    const args = join(root, 'args');
    const env = { ...process.env, HOME: root, SHELL: '/bin/zsh', PATH: bin + ':/usr/bin:/bin', TEST_LOG: log, TEST_ARGS: args };
    const source = await readFile(resolve('scripts/install.sh'), 'utf8');
    const install = (overrides = {}, input = source) => spawnSync('/bin/bash', [], { input, encoding: 'utf8', env: { ...env, ...overrides } });
    await run({ root, log, args, install, source });
  } finally { await rm(root, { recursive: true, force: true }); }
}

it('supports curl-to-bash input, paths with spaces and repeat setup without duplicating the shell configuration', async () => {
  await fixture(async ({ root, log, args, install }) => {
    await writeFile(join(root, '.zprofile'), 'export EDITOR=vim\n');
    expect(install().status).toBe(0);
    expect(await readFile(log, 'utf8')).toBe('install\nsetup\n');
    const command = await readFile(args, 'utf8');
    expect(command).toContain(`--prefix ${root}/.local`);
    expect(command).toContain('@agentonweb/terminal-host@0.2.0');
    const profile = join(root, '.zprofile');
    const first = await readFile(profile, 'utf8');
    expect(first).toContain('export EDITOR=vim\n');
    expect(first).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(install().status).toBe(0);
    expect(await readFile(profile, 'utf8')).toBe(first);
  });
});

it('stops before setup on failed installation and does not claim readiness when setup fails', async () => {
  await fixture(async ({ root, log, install }) => {
    expect(install({ TEST_INSTALL_EXIT: '1' }).status).toBe(1);
    expect(await readFile(log, 'utf8')).toBe('install\n');
    const failed = install({ TEST_SETUP_EXIT: '1' });
    expect(failed.status).toBe(1);
    expect(failed.stdout).not.toContain('Ready.');
    await expect(access(join(root, '.zprofile'))).rejects.toThrow();
  });
});

it('does not install on unsupported platforms, under root, with old Node, or from an incomplete stream', async () => {
  await fixture(async ({ log, install, source }) => {
    for (const options of [{ TEST_OS: 'Linux' }, { TEST_UID: '0' }, { TEST_NODE_EXIT: '1' }]) {
      expect(install(options).status).not.toBe(0);
    }
    expect(install({}, source.slice(0, source.indexOf('  # Make'))).status).not.toBe(0);
    await expect(access(log)).rejects.toThrow();
  });
});
