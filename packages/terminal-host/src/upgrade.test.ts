import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ directory: '', root: '/tmp/aow prefix/lib/node_modules/@agentonweb/terminal-host', version: '0.4.0',
  check: vi.fn(), prepare: vi.fn(), release: vi.fn(), reload: vi.fn(), spawn: vi.fn(), loaded: vi.fn() }));
vi.mock('./version.js', () => ({ packageDirectory: '/unused', VERSION: '0.4.0', installedVersion: () => f.version }));
vi.mock('./updates.js', () => ({ Updates: class { check = f.check; } }));
vi.mock('./management.js', () => ({ outsideTerminal: vi.fn(), liveEndpoint: vi.fn(async () => undefined) }));
vi.mock('./service.js', () => ({ get serviceDirectory() { return f.directory; }, prepareService: f.prepare, reloadService: f.reload, serviceLoaded: f.loaded }));
vi.mock('node:child_process', () => ({ spawn: f.spawn }));
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(),
  realpath: async () => f.root, access: vi.fn(async () => {}) }));
import { npmPrefix, updateCommand } from './upgrade.js';
beforeEach(async () => {
  vi.clearAllMocks();
  f.directory = await mkdtemp(join(tmpdir(), 'aow-upgrade-')); f.version = '0.4.0';
  f.root = '/tmp/aow prefix/lib/node_modules/@agentonweb/terminal-host';
  vi.stubGlobal('process', { ...process, platform: 'darwin' });
  f.check.mockResolvedValue({ currentVersion: '0.4.0', latest: '0.5.0', node: '>=22.19.0', updateAvailable: true });
  f.prepare.mockResolvedValue({ status: { version: '0.4.0', managedService: true, activeTerminals: 0 }, release: f.release });
  f.loaded.mockReturnValue(true);
  f.spawn.mockImplementation(() => {
    const child = new EventEmitter(); queueMicrotask(() => { f.version = '0.5.0'; child.emit('exit', 0); }); return child;
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await rm(f.directory, { recursive: true, force: true }); });
it('installs the exact checked version in the original prefix, skips setup and verifies/reloads the host', async () => {
  await updateCommand([]);
  expect(f.spawn.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--prefix', '/tmp/aow prefix', '@agentonweb/terminal-host@0.5.0']));
  expect(f.spawn.mock.calls[0]?.[2]).toMatchObject({ env: { AOW_SKIP_SETUP: '1' }, timeout: 9 * 60000 });
  expect(f.reload).toHaveBeenCalledWith('0.5.0', undefined); expect(f.release).toHaveBeenCalledOnce();
});
it('does not install or restart while terminals are active, and releases the update guard', async () => {
  f.prepare.mockRejectedValue(new Error('1 active terminal'));
  await expect(updateCommand([])).rejects.toThrow('active terminal');
  expect(f.spawn).not.toHaveBeenCalled(); expect(f.reload).not.toHaveBeenCalled();
  // A retry reaches prepare rather than a stale guard.
  await expect(updateCommand([])).rejects.toThrow('active terminal');
});
it('leaves the service running on npm failure and releases maintenance', async () => {
  f.spawn.mockImplementation(() => { const child = new EventEmitter(); queueMicrotask(() => child.emit('exit', 1)); return child; });
  await expect(updateCommand([])).rejects.toThrow('not restarted');
  expect(f.reload).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
});
it('refuses unsupported install layouts, incompatible Node and failed version queries before npm runs', async () => {
  expect(() => npmPrefix('/tmp/workspace/packages/terminal-host')).toThrow('global npm');
  f.check.mockResolvedValue({ updateAvailable: true, latest: '0.5.0', node: '>=999.0.0' });
  await expect(updateCommand([])).rejects.toThrow('requires Node');
  f.check.mockResolvedValue({ error: 'offline' }); await expect(updateCommand([])).rejects.toThrow('offline');
  expect(f.spawn).not.toHaveBeenCalled();
});
it('does not downgrade or restart when there is no newer version', async () => {
  f.check.mockResolvedValue({ currentVersion: '0.6.0', updateAvailable: false });
  await updateCommand([]); expect(f.prepare).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
});
it('reinstalls the current stable version and restarts when force is explicit, without downgrading', async () => {
  f.check.mockResolvedValue({ currentVersion: '0.4.0', latest: '0.4.0', updateAvailable: false });
  f.spawn.mockImplementation(() => { const child = new EventEmitter(); queueMicrotask(() => child.emit('exit', 0)); return child; });
  await updateCommand(['--force']);
  expect(f.spawn.mock.calls[0]?.[1]).toContain('@agentonweb/terminal-host@0.4.0');
  expect(f.reload).toHaveBeenCalledWith('0.4.0', undefined);
  f.spawn.mockClear(); f.reload.mockClear();
  f.check.mockResolvedValue({ currentVersion: '0.4.0', latest: '0.3.0', updateAvailable: false });
  await updateCommand(['--force']);
  expect(f.spawn).not.toHaveBeenCalled();
  expect(f.reload).not.toHaveBeenCalled();
});
it('does not restart after an unexpected installed version and only forwards explicit force', async () => {
  f.spawn.mockImplementation(() => { const child = new EventEmitter(); queueMicrotask(() => child.emit('exit', 0)); return child; });
  await expect(updateCommand(['--force'])).rejects.toThrow('expected version');
  expect(f.prepare).toHaveBeenCalledWith(true); expect(f.reload).not.toHaveBeenCalled();
});
it('installs before restarting a verified legacy service and preserves it on npm failure', async () => {
  f.prepare.mockResolvedValue({ status: undefined, legacyPid: 777, release: f.release });
  await updateCommand(['--force']);
  expect(f.reload).toHaveBeenCalledWith('0.5.0', 777);
  expect(f.release).toHaveBeenCalledOnce();
  f.reload.mockClear(); f.release.mockClear();
  f.spawn.mockImplementation(() => { const child = new EventEmitter(); queueMicrotask(() => child.emit('exit', 1)); return child; });
  await expect(updateCommand(['--force'])).rejects.toThrow('not restarted');
  expect(f.reload).not.toHaveBeenCalled();
  expect(f.release).toHaveBeenCalledOnce();
});
