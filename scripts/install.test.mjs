import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink, readlink, rename, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const fish = process.env.AOW_TEST_FISH || spawnSync('/bin/sh', ['-c', 'command -v fish'], { encoding: 'utf8' }).stdout.trim();

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
    const env = { ...process.env, HOME: root, SHELL: '/bin/zsh', PATH: bin + ':/usr/bin:/bin', TEST_LOG: log, TEST_ARGS: args,
      ZDOTDIR: undefined, XDG_CONFIG_HOME: undefined, BASH_ENV: undefined, ENV: undefined };
    const source = await readFile(resolve('scripts/install.sh'), 'utf8');
    const install = (overrides = {}, input = source) => spawnSync('/bin/bash', [], { input, encoding: 'utf8', env: { ...env, ...overrides } });
    const shell = (executable, options, overrides = {}, command = 'aow service open') => spawnSync(executable, [...options, command], {
      input: '', encoding: 'utf8', env: { ...env, ...overrides },
    });
    await run({ root, log, args, install, source, shell });
  } finally { await rm(root, { recursive: true, force: true }); }
}

it('supports curl-to-bash input, paths with spaces and repeat setup without duplicating the shell configuration', async () => {
  await fixture(async ({ root, log, args, install }) => {
    await writeFile(join(root, '.zprofile'), 'export EDITOR=vim\n');
    expect(install().status).toBe(0);
    expect(await readFile(log, 'utf8')).toBe('install\nsetup\n');
    const command = await readFile(args, 'utf8');
    expect(command).toContain(`--prefix ${root}/.local`);
    expect(command).toContain('@agentonweb/terminal-host@0.2.1');
    const profile = join(root, '.zprofile');
    const first = await readFile(profile, 'utf8');
    expect(first).toContain('export EDITOR=vim\n');
    expect(first).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(install().status).toBe(0);
    expect(await readFile(profile, 'utf8')).toBe(first);
  });
});

it.each([
  ['zsh interactive', '/bin/zsh', ['-ic']],
  ['zsh login', '/bin/zsh', ['-lic']],
  ['bash interactive', '/bin/bash', ['-ic']],
  ['bash login', '/bin/bash', ['-lic']],
].filter(([, executable]) => existsSync(executable)))('makes aow available in a new %s shell', async (_name, executable, options) => {
  await fixture(async ({ install, shell, log }) => {
    expect(install().status).toBe(0);
    const result = shell(executable, options, { PATH: '/usr/bin:/bin' });
    expect(result.stderr).not.toContain('command not found');
    expect(result.status).toBe(0);
    expect(await readFile(log, 'utf8')).toBe('install\nsetup\nservice\n');
  });
});

it.each([
  ['zsh', '/bin/zsh', ['-f', '-c']],
  ['bash', '/bin/bash', ['--noprofile', '--norc', '-c']],
  ...(fish ? [['fish', fish, ['--no-config', '-c']]] : []),
].filter(([, executable]) => existsSync(executable)))('runs aow in the same %s shell immediately after installation without sourcing a profile', async (_name, executable, options) => {
  await fixture(async ({ shell, log, root }) => {
    const result = shell(executable, options, { AOW_TEST_INSTALLER: resolve('scripts/install.sh') }, 'cat "$AOW_TEST_INSTALLER" | /bin/bash && aow service open');
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(log, 'utf8')).toBe('install\nsetup\nservice\n');
    expect(await readlink(join(root, 'bin/aow'))).toBe(join(root, '.local/bin/aow'));
  });
});

it('replaces an older AgentOnWeb npm link on the current PATH', async () => {
  await fixture(async ({ root, install, shell, log }) => {
    const legacy = join(root, 'lib/node_modules/@agentonweb/codex-surface/lib');
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, 'cli.js'), '#!/bin/sh\nexit 42\n', { mode: 0o700 });
    await symlink('../lib/node_modules/@agentonweb/codex-surface/lib/cli.js', join(root, 'bin/aow'));
    expect(install().status).toBe(0);
    expect(shell('/bin/bash', ['--noprofile', '--norc', '-c']).status).toBe(0);
    expect(await readFile(log, 'utf8')).toBe('install\nsetup\nservice\n');
  });
});

it('prefers the installed command over an older aow in the terminal PATH', async () => {
  await fixture(async ({ root, install, shell }) => {
    await writeFile(join(root, 'bin/aow'), '#!/bin/sh\nexit 42\n', { mode: 0o700 });
    expect(install().status).toBe(0);
    const result = shell('/bin/bash', ['-ic'], {
      PATH: `${root}/bin:/usr/bin:/bin:${root}/.local/bin`,
    });
    expect(result.status).toBe(0);
  });
});

it.each([false, true])('configures fish with a custom config directory: %s', async (custom) => {
  await fixture(async ({ root, install, shell, log }) => {
    const config = join(root, custom ? 'custom fish' : '.config');
    const overrides = { SHELL: custom ? '/bin/zsh' : fish || '/usr/local/bin/fish', ...(custom ? { XDG_CONFIG_HOME: config } : {}) };
    // Cover installed fish detection even when the login shell is zsh.
    if (custom) await writeFile(join(root, 'bin/fish'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    await mkdir(join(config, 'fish'), { recursive: true });
    const profile = join(config, 'fish/config.fish');
    await writeFile(profile, 'set -gx AOW_EXISTING_SETTING preserved\n');
    const result = install(overrides);
    expect(result.status).toBe(0);
    const first = await readFile(profile, 'utf8');
    expect(first).toContain('set -gx AOW_EXISTING_SETTING preserved\n');
    expect(install(overrides).status).toBe(0);
    expect(await readFile(profile, 'utf8')).toBe(first);
    if (fish) {
      for (const options of [['-ic'], ['-lic']]) {
        const opened = shell(fish, options, { ...overrides, PATH: '/usr/bin:/bin' }, 'test "$AOW_EXISTING_SETTING" = preserved && aow service open');
        expect(opened.status).toBe(0);
      }
    }
    expect(await readFile(log, 'utf8')).toBe('install\nsetup\ninstall\nsetup\n' + (fish ? 'service\nservice\n' : ''));
  });
});

it('configures zsh in an exported ZDOTDIR and preserves existing startup settings', async () => {
  await fixture(async ({ root, install, shell, log }) => {
    const zdotdir = join(root, 'custom zsh');
    await mkdir(zdotdir);
    await writeFile(join(zdotdir, '.zshrc'), 'export AOW_EXISTING_SETTING=preserved\n');
    expect(install({ ZDOTDIR: zdotdir }).status).toBe(0);
    const first = await readFile(join(zdotdir, '.zshrc'), 'utf8');
    expect(first).toContain('export AOW_EXISTING_SETTING=preserved\n');
    expect(install({ ZDOTDIR: zdotdir }).status).toBe(0);
    expect(await readFile(join(zdotdir, '.zshrc'), 'utf8')).toBe(first);
    if (existsSync('/bin/zsh')) {
      const result = shell('/bin/zsh', ['-ic'], { ZDOTDIR: zdotdir }, 'test "$AOW_EXISTING_SETTING" = preserved && aow service open');
      expect(result.status).toBe(0);
      expect(await readFile(log, 'utf8')).toContain('service\n');
    }
    await expect(access(join(root, '.zprofile'))).rejects.toThrow();
  });
});

it.each(['.bash_login', '.profile'])('preserves bash login initialization through %s', async (profile) => {
  await fixture(async ({ root, install, shell }) => {
    await writeFile(join(root, profile), 'export AOW_EXISTING_SETTING=preserved\n');
    expect(install({ SHELL: '/bin/bash' }).status).toBe(0);
    await expect(access(join(root, '.bash_profile'))).rejects.toThrow();
    expect(await readFile(join(root, profile), 'utf8')).toContain('export AOW_EXISTING_SETTING=preserved\n');
    expect(shell('/bin/bash', ['-lic'], {}, 'test "$AOW_EXISTING_SETTING" = preserved && aow service open').status).toBe(0);
  });
});

it('preserves an unrelated command and prints the full path fallback for the existing terminal', async () => {
  await fixture(async ({ root, install, shell }) => {
    const existing = '#!/bin/sh\nexit 42\n';
    await writeFile(join(root, 'bin/aow'), existing, { mode: 0o700 });
    const result = install();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"$HOME/.local/bin/aow" service');
    expect(result.stdout).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(await readFile(join(root, 'bin/aow'), 'utf8')).toBe(existing);
    expect(shell('/bin/bash', ['--noprofile', '--norc', '-c']).status).toBe(42);
    const direct = spawnSync(join(root, '.local/bin/aow'), ['service', 'open'], { input: '', encoding: 'utf8',
      env: { ...process.env, HOME: root, TEST_LOG: join(root, 'calls') } });
    expect(direct.status).toBe(0);
  });
});

it.each([false, true])('leaves the npm entry intact when Node is already in ~/.local/bin (symlink directory: %s)', async (alias) => {
  await fixture(async ({ root, install, shell }) => {
    await rename(join(root, 'bin/node'), join(root, '.local/bin/node'));
    if (alias) await symlink('.local/bin', join(root, 'node-bin'));
    const overrides = { PATH: `${root}/${alias ? 'node-bin' : '.local/bin'}:${root}/bin:/usr/bin:/bin` };
    const result = install(overrides);
    expect(result.status).toBe(0);
    expect(shell('/bin/bash', ['--noprofile', '--norc', '-c'], overrides).status).toBe(0);
    await expect(readlink(join(root, '.local/bin/aow'))).rejects.toThrow();
  });
});

it.skipIf(process.getuid?.() === 0)('uses the full path fallback when the Node directory is read-only', async () => {
  await fixture(async ({ root, install }) => {
    await chmod(join(root, 'bin'), 0o500);
    try {
      const result = install();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"$HOME/.local/bin/aow" service');
      await expect(access(join(root, 'bin/aow'))).rejects.toThrow();
    } finally { await chmod(join(root, 'bin'), 0o700); }
  });
});

it('stops on failed installation and leaves the installed command usable when setup fails', async () => {
  await fixture(async ({ root, log, install, shell }) => {
    expect(install({ TEST_INSTALL_EXIT: '1' }).status).toBe(1);
    expect(await readFile(log, 'utf8')).toBe('install\n');
    await expect(access(join(root, '.zprofile'))).rejects.toThrow();
    const failed = install({ TEST_SETUP_EXIT: '1' });
    expect(failed.status).toBe(1);
    expect(failed.stdout).not.toContain('Ready.');
    expect(failed.stderr).toContain('"$HOME/.local/bin/aow" setup');
    expect(shell('/bin/bash', ['-ic']).status).toBe(0);
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
