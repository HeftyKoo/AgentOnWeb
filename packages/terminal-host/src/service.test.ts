import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ writeFile: vi.fn(async (..._args: unknown[]) => {}), readFile: vi.fn(), execFileSync: vi.fn(() => '') }));
vi.mock('node:fs/promises', () => ({ mkdir: async () => {}, writeFile: mocks.writeFile, readFile: mocks.readFile, unlink: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }));
import { serviceCommand } from './service.js';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501, kill: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('opens the connection page by default without changing the running service', async () => {
  const launchUrl = 'http://localhost:57251/launch?token=test-token';
  mocks.readFile.mockResolvedValue(JSON.stringify({ pid: process.pid, launchUrl }));
  await serviceCommand([]);
  expect(mocks.execFileSync).toHaveBeenCalledExactlyOnceWith('/usr/bin/open', [launchUrl]);
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
it('updates installed startup paths without restarting existing terminals', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await serviceCommand(['install', '--no-open']);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.writeFile.mock.calls[0]?.[1]).toContain(process.execPath);
    expect(mocks.execFileSync).toHaveBeenCalledExactlyOnceWith('/bin/launchctl', ['print', `gui/${process.getuid!()}/com.agentonweb.terminal`], { stdio: 'ignore' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('next login'));
  } finally { log.mockRestore(); }
});

it.each(['--help', '-h'])('shows service help without accessing macOS APIs: %s', async (flag) => {
  vi.stubGlobal('process', { ...process, platform: 'linux' });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await serviceCommand([flag]);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('default: open'));
  expect(mocks.execFileSync).not.toHaveBeenCalled();
});

it.each([['unknown'], ['open', '--no-open'], ['install', '--unknown'], ['install', '--no-open', 'extra']])('rejects invalid service arguments before touching the service: %j', async (...args) => {
  await expect(serviceCommand(args)).rejects.toThrow('Usage: aow service');
  expect(mocks.execFileSync).not.toHaveBeenCalled();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

it('explains how to repair a missing or unready service', async () => {
  vi.useFakeTimers();
  mocks.readFile.mockRejectedValue(new Error('ENOENT'));
  const result = expect(serviceCommand([])).rejects.toThrow('Run aow setup');
  await vi.runAllTimersAsync();
  await result;
});
