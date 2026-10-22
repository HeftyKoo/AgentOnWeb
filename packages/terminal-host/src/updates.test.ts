import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Updates } from './updates.js';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aow-updates-'));
  vi.stubEnv('CI', ''); vi.stubEnv('AOW_UPDATE_CHECK', '');
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); await rm(directory, { recursive: true, force: true }); });
function fixture(version = '0.4.0', latest = '0.5.0') {
  const request = vi.fn<typeof fetch>(async () => Response.json({ name: '@agentonweb/terminal-host', version: latest, engines: { node: '>=22.19.0' } }));
  let now = 100000;
  const updates = new Updates(directory, { fetch: request, version, now: () => now });
  return { updates, request, advance: (ms: number) => { now += ms; } };
}
it('caches successful checks across processes for 24 hours and explicit checks bypass the cache', async () => {
  const f = fixture();
  expect(await f.updates.check()).toMatchObject({ latest: '0.5.0', updateAvailable: true });
  await new Updates(directory, { fetch: f.request, version: '0.4.0', now: () => 100001 }).check();
  expect(f.request).toHaveBeenCalledOnce();
  await f.updates.check(true);
  expect(f.request).toHaveBeenCalledTimes(2);
  f.advance(24 * 60 * 60 * 1000);
  await f.updates.check();
  expect(f.request).toHaveBeenCalledTimes(3);
});
it.each([['0.9.0', '0.10.0', true], ['0.5.0', '0.4.0', false], ['0.4.0', '0.4.0', false], ['0.5.0-beta.1', '0.5.0', true]])('compares semantic versions without downgrading: %s → %s', async (current, latest, expected) => {
  expect((await fixture(current, latest).updates.check()).updateAvailable).toBe(expected);
});
it.each(['0.5.0-beta.1', 'garbage', '0.5.0; touch /tmp/x'])('rejects invalid/prerelease latest metadata: %s', async latest => {
  expect(await fixture('0.4.0', latest).updates.check(true)).toMatchObject({ error: expect.any(String), updateAvailable: false });
});
it('keeps the last successful result on network failure and backs off across restarts', async () => {
  const f = fixture();
  await f.updates.check();
  f.request.mockRejectedValue(new Error('offline'));
  expect(await f.updates.check(true)).toMatchObject({ latest: '0.5.0', checkedAt: 100000, failures: 1, nextCheck: 100000 + 15 * 60000 });
  await f.updates.check(); expect(f.request).toHaveBeenCalledTimes(3);
  f.advance(15 * 60000);
  expect(await f.updates.check()).toMatchObject({ failures: 2, nextCheck: 100000 + 45 * 60000 });
});
it('persists opt-out while allowing an explicit check, and honors environment/CI opt-outs', async () => {
  const f = fixture();
  await f.updates.configure(false);
  expect((await f.updates.check()).enabled).toBe(false);
  expect(f.request).not.toHaveBeenCalled();
  await f.updates.check(true); expect(f.request).toHaveBeenCalledOnce();
  await f.updates.configure(true);
  vi.stubEnv('AOW_UPDATE_CHECK', '0'); expect((await f.updates.status()).enabled).toBe(false);
  vi.stubEnv('AOW_UPDATE_CHECK', ''); vi.stubEnv('CI', 'true'); expect((await f.updates.status()).enabled).toBe(false);
});
it('recovers from corrupt cache, sends no runtime data, and bounds the network wait', async () => {
  await writeFile(join(directory, 'update-cache.json'), '{broken');
  const f = fixture(); await f.updates.check();
  const [url, options] = f.request.mock.calls[0]!;
  expect(url).toBe('https://registry.npmjs.org/@agentonweb%2Fterminal-host/latest');
  expect(options).toMatchObject({ redirect: 'error', headers: { accept: 'application/json' } });
  expect(options?.signal).toBeInstanceOf(AbortSignal);
  expect(options?.body).toBeUndefined();
  expect(JSON.parse(await readFile(join(directory, 'update-cache.json'), 'utf8'))).toMatchObject({ latest: '0.5.0' });
});
it('coalesces checks and stops background timers', async () => {
  const f = fixture();
  const first = f.updates.check(); const second = f.updates.check();
  expect(first).toBe(second); await first;
  vi.useFakeTimers();
  const stop = f.updates.start(); expect(vi.getTimerCount()).toBe(2);
  stop(); expect(vi.getTimerCount()).toBe(0);
});
it('retries a transient timeout for a manual check with a longer request deadline', async () => {
  const request = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
    .mockResolvedValueOnce(Response.json({ name: '@agentonweb/terminal-host', version: '0.5.0' }));
  const deadline = vi.spyOn(AbortSignal, 'timeout');
  const updates = new Updates(directory, { fetch: request, version: '0.4.1' });
  expect(await updates.check(true)).toMatchObject({ latest: '0.5.0', updateAvailable: true, failures: 0 });
  expect(request).toHaveBeenCalledTimes(2);
  expect(deadline).toHaveBeenCalledWith(15000);
  deadline.mockRestore();
});
it('does not retry automatic checks or invalid stable metadata', async () => {
  const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
  const updates = new Updates(directory, { fetch: request });
  expect(await updates.check()).toHaveProperty('error');
  expect(request).toHaveBeenCalledOnce();
  request.mockClear().mockResolvedValue(Response.json({ name: '@agentonweb/terminal-host', version: '0.5.0-beta.1' }));
  expect(await updates.check(true)).toHaveProperty('error');
  expect(request).toHaveBeenCalledOnce();
});
it.each([429, 503])('retries a temporary registry HTTP failure: %s', async status => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status }))
    .mockResolvedValueOnce(Response.json({ name: '@agentonweb/terminal-host', version: '0.5.0' }));
  expect(await new Updates(directory, { fetch: request, version: '0.4.1' }).check(true)).toMatchObject({ latest: '0.5.0', failures: 0 });
  expect(request).toHaveBeenCalledTimes(2);
});
it('bounds manual retries and keeps a safe failure reason across processes', async () => {
  const request = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('private request details', 'TimeoutError'));
  const updates = new Updates(directory, { fetch: request });
  const status = await updates.check(true);
  expect(status.error).toContain('request timed out');
  expect(request).toHaveBeenCalledTimes(2);
  expect((await new Updates(directory).status()).error).toBe(status.error);
  expect(await readFile(join(directory, 'update-cache.json'), 'utf8')).not.toContain('private request details');
});
it('retains cached metadata alongside a permanent HTTP failure without retrying', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ name: '@agentonweb/terminal-host', version: '0.5.0' }));
  const updates = new Updates(directory, { fetch: request, version: '0.4.1' });
  await updates.check(true);
  request.mockClear().mockResolvedValue(new Response('', { status: 404 }));
  expect(await updates.check(true)).toMatchObject({ latest: '0.5.0', error: expect.stringContaining('HTTP 404'), failures: 1 });
  expect(request).toHaveBeenCalledOnce();
});
