import { afterEach, expect, it, vi } from 'vitest';
import { setup, uninstall } from './setup.js';
import { installCodexHooks, uninstallCodexHooks } from './codex-hooks.js';
import { installClaudeHooks, uninstallClaudeHooks } from './claude-hooks.js';
import { uninstallNativeBridge } from './native-bridge.js';
import { serviceCommand } from './service.js';

vi.mock('./codex-hooks.js', () => ({ uninstallCodexHooks: vi.fn(), installCodexHooks: vi.fn() }));
vi.mock('./claude-hooks.js', () => ({ uninstallClaudeHooks: vi.fn(), installClaudeHooks: vi.fn() }));
vi.mock('./native-bridge.js', () => ({ uninstallNativeBridge: vi.fn(), installNativeBridge: vi.fn(), extensionOrigin: vi.fn(), STORE_EXTENSION_ID: 'test' }));
vi.mock('./service.js', () => ({ serviceCommand: vi.fn(), serviceDirectory: '/unused' }));
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('rejects a missing CLI before modifying user integrations', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501,
    argv: [process.execPath, '/missing-agentonweb-installation/cli.js'] });
  await expect(setup([])).rejects.toThrow('Reinstall @agentonweb/terminal-host');
  expect(installCodexHooks).not.toHaveBeenCalled();
  expect(installClaudeHooks).not.toHaveBeenCalled();
  expect(serviceCommand).not.toHaveBeenCalled();
});

it('removes the native bridge and service even if Codex configuration is malformed', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501 });
  const failure = new SyntaxError('Invalid hooks.json');
  vi.mocked(uninstallCodexHooks).mockRejectedValue(failure);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await expect(uninstall()).rejects.toMatchObject({ errors: [failure] });
  expect(uninstallNativeBridge).toHaveBeenCalledOnce();
  expect(uninstallClaudeHooks).toHaveBeenCalledOnce();
  expect(serviceCommand).toHaveBeenCalledWith(['uninstall']);
  expect(log).not.toHaveBeenCalled();
});

it('continues all cleanup steps when Claude Code settings are malformed', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501 });
  const failure = new SyntaxError('Invalid settings.json');
  vi.mocked(uninstallClaudeHooks).mockRejectedValue(failure);
  await expect(uninstall()).rejects.toMatchObject({ errors: [failure] });
  expect(uninstallCodexHooks).toHaveBeenCalledOnce();
  expect(uninstallNativeBridge).toHaveBeenCalledOnce();
  expect(serviceCommand).toHaveBeenCalledWith(['uninstall']);
});
