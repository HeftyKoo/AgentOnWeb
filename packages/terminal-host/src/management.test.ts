import { afterEach, expect, it, vi } from 'vitest';
import { Maintenance, outsideTerminal, hostRequest } from './management.js';
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('protects idle live shells, freezes new terminals and serializes maintenance until released', () => {
  const maintenance = new Maintenance();
  expect(() => maintenance.prepare(1, false)).toThrow('active terminal');
  expect(maintenance.active).toBe(false);
  const token = maintenance.prepare(0, false);
  expect(maintenance.active).toBe(true);
  expect(() => maintenance.prepare(0, true)).toThrow('in progress');
  maintenance.release('different-token'); expect(maintenance.active).toBe(true);
  maintenance.release(token); expect(maintenance.active).toBe(false);
});
it('allows explicit force and expires a lease after an interrupted CLI', () => {
  vi.useFakeTimers();
  const maintenance = new Maintenance(); maintenance.prepare(2, true);
  vi.advanceTimersByTime(10 * 60 * 1000); expect(maintenance.active).toBe(false);
});
it('refuses to kill the terminal running the upgrade command itself', () => {
  vi.stubEnv('AOW_AGENT_ENDPOINT', 'http://127.0.0.1:1/agent-event');
  expect(outsideTerminal).toThrow('separate macOS Terminal');
});
it('identifies an older host whose unknown control route returns the browser login response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Connect through AgentOnWeb, or open the one-time link printed in your host terminal.', { status: 401 })));
  await expect(hostRequest({ pid: 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch?token=private' }))
    .rejects.toMatchObject({ status: 401, legacyPid: 777, message: expect.stringContaining('aow service restart --force') });
});
it.each([401, 403])('does not treat authorization failure on an update-capable host as a legacy host: %s', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
  await expect(hostRequest({ pid: 777, version: '0.4.1', managedService: true, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }))
    .rejects.toMatchObject({ status, legacyPid: undefined, message: expect.stringContaining(`HTTP ${status}`) });
});
it('preserves the specific busy-terminal error from the host', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: '1 active terminal(s). Exit or close them first.' }, { status: 409 })));
  await expect(hostRequest({ pid: 777, nativeToken: 'test', launchUrl: 'http://localhost:1234/launch' }, { action: 'prepare' }))
    .rejects.toThrow('1 active terminal(s)');
});
