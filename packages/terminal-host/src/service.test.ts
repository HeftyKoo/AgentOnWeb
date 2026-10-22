import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ mkdir: vi.fn(), rmdir: vi.fn(), writeFile: vi.fn(async (..._args: unknown[]) => {}), readFile: vi.fn(), execFileSync: vi.fn<(...args: any[]) => string>(() => '') }));
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir, rmdir: mocks.rmdir, writeFile: mocks.writeFile, readFile: mocks.readFile, unlink: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }));
import { prepareService, serviceCommand } from './service.js';
import { VERSION } from './version.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readFile.mockReset();
  mocks.execFileSync.mockReset().mockReturnValue('');
  mocks.mkdir.mockReset().mockResolvedValue(undefined);
  mocks.rmdir.mockReset().mockResolvedValue(undefined);
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

it('refuses a restart with live terminals before calling bootout or writing configuration', async () => {
  mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }));
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => options?.method === 'POST'
    ? Response.json({ error: '1 active terminal' }, { status: 409 })
    : Response.json({ version: '0.4.0', activeTerminals: 1, managedService: true })));
  await expect(serviceCommand(['restart'])).rejects.toThrow('active terminal');
  expect(mocks.execFileSync).not.toHaveBeenCalled(); expect(mocks.writeFile).not.toHaveBeenCalled();
});

it('restarts after maintenance and confirms the new PID and running version', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  let bootedOut = false, bootstrapped = false;
  const endpoint = (pid: number) => JSON.stringify({ pid, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' });
  mocks.readFile.mockImplementation(async () => endpoint(bootstrapped ? 888 : 777));
  mocks.execFileSync.mockImplementation((_file: string, args: string[]) => {
    if (args[0] === 'bootout') bootedOut = true;
    if (args[0] === 'bootstrap') bootstrapped = true;
    if (args[0] === 'print' && bootedOut && !bootstrapped) throw new Error('unloaded');
    return '';
  });
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501, kill: (pid: number) => {
    if (pid === 777 && bootedOut) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  } });
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options?.method === 'POST') return Response.json({ token: 'lease' });
    return Response.json({ version: bootstrapped ? VERSION : '0.4.0', activeTerminals: 0, managedService: true });
  }));
  await serviceCommand(['restart']);
  expect(bootedOut).toBe(true); expect(bootstrapped).toBe(true);
  expect(log).toHaveBeenCalledWith(expect.stringContaining(`AgentOnWeb service is running version ${VERSION}.`));
});

it('reports readiness failure instead of claiming a successful restart', async () => {
  vi.useFakeTimers();
  mocks.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  mocks.execFileSync.mockImplementation((_file: string, args: string[]) => { if (args[0] === 'print') throw new Error('unloaded'); return ''; });
  const result = expect(serviceCommand(['restart'])).rejects.toThrow('did not confirm version');
  await vi.runAllTimersAsync(); await result;
});

it('refuses an older host without explicit force and explains how to recover', async () => {
  mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Connect through AgentOnWeb', { status: 401 })));
  await expect(serviceCommand(['restart'])).rejects.toThrow('aow service restart --force');
  expect(mocks.execFileSync).not.toHaveBeenCalled();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

it('force-restarts an older host only when launchctl confirms it is the managed service', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  let bootedOut = false, bootstrapped = false;
  mocks.readFile.mockImplementation(async () => JSON.stringify({ pid: bootstrapped ? 888 : 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }));
  mocks.execFileSync.mockImplementation((_file: string, args: string[]) => {
    if (args[0] === 'bootout') bootedOut = true;
    if (args[0] === 'bootstrap') bootstrapped = true;
    if (args[0] === 'print' && bootedOut && !bootstrapped) throw new Error('unloaded');
    return '\tpid = ' + (bootstrapped ? '888' : '777') + '\n';
  });
  vi.stubGlobal('process', { ...process, platform: 'darwin', getuid: () => 501, kill: (pid: number) => {
    if (pid === 777 && bootedOut) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  } });
  vi.stubGlobal('fetch', vi.fn(async () => bootstrapped
    ? Response.json({ version: VERSION, activeTerminals: 0, managedService: true })
    : new Response('Connect through AgentOnWeb', { status: 401 })));
  await serviceCommand(['restart', '--force']);
  expect(bootedOut).toBe(true);
  expect(bootstrapped).toBe(true);
});

it.each([['401', '999'], ['403', '777']])('does not force-stop a mismatched service or an authorization failure: %s / %s', async (status, pid) => {
  mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }));
  mocks.execFileSync.mockReturnValue('\tpid = ' + pid + '\n');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: Number(status) })));
  await expect(serviceCommand(['restart', '--force'])).rejects.toThrow();
  expect(mocks.execFileSync.mock.calls.some(([, args]) => args[0] === 'bootout')).toBe(false);
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

it('refuses to stop a replacement host that appears before the legacy restart', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const endpoint = (pid: number) => JSON.stringify({ pid, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' });
  mocks.readFile.mockResolvedValueOnce(endpoint(777)).mockResolvedValueOnce(endpoint(777)).mockResolvedValue(endpoint(888));
  mocks.execFileSync.mockReturnValue('\tpid = 777\n');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Connect through AgentOnWeb', { status: 401 })));
  await expect(serviceCommand(['restart', '--force'])).rejects.toThrow('changed before restart');
  expect(mocks.execFileSync.mock.calls.some(([, args]) => args[0] === 'bootout')).toBe(false);
  expect(mocks.rmdir).toHaveBeenCalledOnce();
});

it('serializes legacy updates and restarts until the guard is released', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }));
  mocks.execFileSync.mockReturnValue('\tpid = 777\n');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Connect through AgentOnWeb', { status: 401 })));
  let busy = false;
  mocks.mkdir.mockImplementation(async () => {
    if (busy) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    busy = true;
  });
  mocks.rmdir.mockImplementation(async () => { busy = false; });
  const prepared = await prepareService(true);
  try { await expect(prepareService(true)).rejects.toThrow('in progress'); }
  finally { await prepared.release(); }
  const retry = await prepareService(true);
  await retry.release();
  expect(mocks.execFileSync.mock.calls.some(([, args]) => args[0] === 'bootout')).toBe(false);
});

it('does not start a replacement if the old process has not fully exited', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }));
  mocks.execFileSync.mockReturnValue('\tpid = 777\n');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Connect through AgentOnWeb', { status: 401 })));
  const result = expect(serviceCommand(['restart', '--force'])).rejects.toThrow('previous host did not stop');
  await vi.runAllTimersAsync();
  await result;
  expect(mocks.execFileSync.mock.calls.some(([, args]) => args[0] === 'bootout')).toBe(true);
  expect(mocks.execFileSync.mock.calls.some(([, args]) => args[0] === 'bootstrap')).toBe(false);
  expect(mocks.writeFile).not.toHaveBeenCalled();
  expect(mocks.rmdir).toHaveBeenCalledOnce();
});
