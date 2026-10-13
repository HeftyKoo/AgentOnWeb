import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { setup, uninstall } from './setup.js';
import { installCodexHooks, uninstallCodexHooks } from './codex-hooks.js';
import { installClaudeHooks, uninstallClaudeHooks } from './claude-hooks.js';
import { installPiExtension, uninstallPiExtension } from './pi-hooks.js';
import { uninstallNativeBridge } from './native-bridge.js';
import { serviceCommand } from './service.js';
import { planAgentSetup, installSelectedAgents, SETUP_AGENTS } from './setup-agents.js';

vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, access: vi.fn(original.access), chmod: vi.fn(original.chmod), readFile: vi.fn(original.readFile) };
});
vi.mock('./codex-hooks.js', () => ({ uninstallCodexHooks: vi.fn(), installCodexHooks: vi.fn() }));
vi.mock('./claude-hooks.js', () => ({ uninstallClaudeHooks: vi.fn(), installClaudeHooks: vi.fn() }));
vi.mock('./pi-hooks.js', () => ({ uninstallPiExtension: vi.fn(), installPiExtension: vi.fn() }));
vi.mock('./native-bridge.js', () => ({ uninstallNativeBridge: vi.fn(), installNativeBridge: vi.fn(), extensionOrigin: vi.fn(), STORE_EXTENSION_ID: 'test' }));
vi.mock('./service.js', () => ({ serviceCommand: vi.fn(), serviceDirectory: '/unused' }));
vi.mock('./setup-agents.js', () => ({ planAgentSetup: vi.fn(), installSelectedAgents: vi.fn(), SETUP_AGENTS: ['codex', 'claude', 'pi'] }));
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('rejects a missing CLI before modifying user integrations', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501,
    argv: [process.execPath, '/missing-agentonweb-installation/cli.js'] });
  await expect(setup([])).rejects.toThrow('Reinstall @agentonweb/terminal-host');
  expect(installCodexHooks).not.toHaveBeenCalled();
  expect(installClaudeHooks).not.toHaveBeenCalled();
  expect(installPiExtension).not.toHaveBeenCalled();
  expect(serviceCommand).not.toHaveBeenCalled();
  expect(planAgentSetup).not.toHaveBeenCalled();
});

function readySetup() {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501, kill: vi.fn() });
  vi.mocked(fs.access).mockResolvedValue(undefined);
  vi.mocked(fs.chmod).mockResolvedValue(undefined);
  vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ pid: 123, nativeToken: 'test-token', launchUrl: 'http://localhost:123/launch' }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(planAgentSetup).mockResolvedValue(['claude']);
}

it.each([
  [[], undefined],
  [['--agents', 'all'], SETUP_AGENTS],
  [['--agents', 'codex,claude,codex'], ['codex', 'claude']],
  [['--agents', 'none'], []],
])('passes CLI selection to setup planning for %j', async (args, selection) => {
  readySetup();
  await setup(args as string[]);
  expect(planAgentSetup).toHaveBeenCalledWith(selection);
  expect(installSelectedAgents).toHaveBeenCalledWith(['claude']);
  expect(serviceCommand).toHaveBeenCalledWith(['install', '--no-open']);
});

it('cancels before writing integrations, changing PTY permissions or configuring the service', async () => {
  readySetup();
  vi.mocked(planAgentSetup).mockRejectedValue(new Error('Setup cancelled'));
  await expect(setup([])).rejects.toThrow('Setup cancelled');
  expect(fs.chmod).not.toHaveBeenCalled();
  expect(installSelectedAgents).not.toHaveBeenCalled();
  expect(serviceCommand).not.toHaveBeenCalled();
});

it.each([
  ['--agents'], ['--agents', ''], ['--agents', 'unknown'], ['--agents', 'codex,'],
  ['--agents', 'all,codex'], ['--agents', 'none,pi'], ['--agents', 'codex', '--agents', 'pi'], ['--unknown', 'pi'],
])('rejects invalid setup options before planning or writing integrations: %j', async (...args) => {
  readySetup();
  await expect(setup(args)).rejects.toThrow('Usage: aow setup');
  expect(planAgentSetup).not.toHaveBeenCalled();
  expect(installSelectedAgents).not.toHaveBeenCalled();
  expect(serviceCommand).not.toHaveBeenCalled();
});

it('shows selection help without requiring macOS, a CLI installation or a terminal', async () => {
  vi.stubGlobal('process', { ...process, platform: 'linux', getuid: () => 0 });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await setup(['--help']);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('ask which integrations'));
  expect(planAgentSetup).not.toHaveBeenCalled();
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
  expect(uninstallPiExtension).toHaveBeenCalledOnce();
  expect(serviceCommand).toHaveBeenCalledWith(['uninstall']);
  expect(log).not.toHaveBeenCalled();
});

it('continues all cleanup steps when Claude Code settings are malformed', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501 });
  const failure = new SyntaxError('Invalid settings.json');
  vi.mocked(uninstallClaudeHooks).mockRejectedValue(failure);
  await expect(uninstall()).rejects.toMatchObject({ errors: [failure] });
  expect(uninstallCodexHooks).toHaveBeenCalledOnce();
  expect(uninstallPiExtension).toHaveBeenCalledOnce();
  expect(uninstallNativeBridge).toHaveBeenCalledOnce();
  expect(serviceCommand).toHaveBeenCalledWith(['uninstall']);
});

it('continues cleanup when the Pi extension path belongs to another file', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501 });
  const failure = new Error('Unrelated Pi extension');
  vi.mocked(uninstallPiExtension).mockRejectedValue(failure);
  await expect(uninstall()).rejects.toMatchObject({ errors: [failure] });
  expect(uninstallCodexHooks).toHaveBeenCalledOnce();
  expect(uninstallClaudeHooks).toHaveBeenCalledOnce();
  expect(uninstallNativeBridge).toHaveBeenCalledOnce();
  expect(serviceCommand).toHaveBeenCalledWith(['uninstall']);
});
