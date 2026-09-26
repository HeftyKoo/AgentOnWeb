import { afterEach, expect, it, vi } from 'vitest';
import { setup, uninstall } from './setup.js';
import { installCodexHooks, uninstallCodexHooks } from './codex-hooks.js';
import { uninstallNativeBridge } from './native-bridge.js';
import { serviceCommand } from './service.js';

vi.mock('./codex-hooks.js', () => ({ uninstallCodexHooks: vi.fn(), installCodexHooks: vi.fn() }));
vi.mock('./native-bridge.js', () => ({ uninstallNativeBridge: vi.fn(), installNativeBridge: vi.fn(), extensionOrigin: vi.fn(), STORE_EXTENSION_ID: 'test' }));
vi.mock('./service.js', () => ({ serviceCommand: vi.fn(), serviceDirectory: '/unused' }));
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('rejects a missing CLI before modifying user integrations', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501,
    argv: [process.execPath, '/missing-agentonweb-installation/cli.js'] });
  await expect(setup([])).rejects.toThrow('Reinstall @agentonweb/terminal-host');
  expect(installCodexHooks).not.toHaveBeenCalled();
  expect(serviceCommand).not.toHaveBeenCalled();
});

it('removes the native bridge and service even if Codex configuration is malformed', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501 });
  const failure = new SyntaxError('Invalid hooks.json');
  vi.mocked(uninstallCodexHooks).mockRejectedValue(failure);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await expect(uninstall()).rejects.toMatchObject({ errors: [failure] });
  expect(uninstallNativeBridge).toHaveBeenCalledOnce();
  expect(serviceCommand).toHaveBeenCalledWith(['uninstall']);
  expect(log).not.toHaveBeenCalled();
});
