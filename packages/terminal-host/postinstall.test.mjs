import { afterEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

vi.mock('./fix-pty-permissions.mjs', () => ({}));
vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));
vi.mock('node:fs', () => ({ openSync: vi.fn(() => 42), closeSync: vi.fn() }));
afterEach(() => { vi.mocked(openSync).mockReset().mockReturnValue(42); vi.mocked(closeSync).mockClear(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([['linux', 501], ['win32', undefined], ['darwin', 0]])(
  'skips automatic setup without failing global installation on %s with uid %s', async (platform, uid) => {
    vi.resetModules(); vi.mocked(spawnSync).mockClear();
    vi.stubGlobal('process', { ...process, platform, getuid: () => uid, exitCode: 0 });
    vi.stubEnv('npm_config_global', 'true'); vi.stubEnv('AOW_SKIP_SETUP', ''); vi.stubEnv('CI', '');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('./postinstall.mjs');
    expect(spawnSync).not.toHaveBeenCalled();
    expect(process.exitCode ?? 0).toBe(0);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('skipped'));
  },
);

it.each([0, 1])('runs setup for a supported global install and preserves setup exit status %s', async status => {
  vi.resetModules(); vi.mocked(spawnSync).mockReset().mockReturnValue({ status });
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501, exitCode: 0 });
  vi.stubEnv('npm_config_global', 'true'); vi.stubEnv('AOW_SKIP_SETUP', ''); vi.stubEnv('CI', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('./postinstall.mjs');
  expect(spawnSync).toHaveBeenCalledWith(process.execPath, [expect.stringContaining('/lib/cli.js'), 'setup'], { stdio: 'inherit' });
  expect(process.exitCode ?? 0).toBe(status);
});

it('leaves a headless global install available and asks for explicit setup instead of choosing integrations', async () => {
  vi.resetModules(); vi.mocked(spawnSync).mockClear();
  vi.mocked(openSync).mockImplementation(() => { throw new Error('No terminal'); });
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501, exitCode: 0 });
  vi.stubEnv('npm_config_global', 'true'); vi.stubEnv('AOW_SKIP_SETUP', ''); vi.stubEnv('CI', '');
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await import('./postinstall.mjs');
  expect(spawnSync).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('aow setup --agents all'));
  expect(process.exitCode).toBe(0);
});
