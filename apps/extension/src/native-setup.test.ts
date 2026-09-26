import { afterEach, expect, it, vi } from 'vitest';
import { nativeSetup, probeNativeSetup } from './native-setup.js';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('backs off automatic native probes across worker reloads without delaying manual pairing', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const values: Record<string, unknown> = {};
  const sendNativeMessage = vi.fn(async () => ({ ok: false }));
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendNativeMessage }, storage: { session: {
    get: async () => values, set: async (next: object) => { Object.assign(values, next); },
    remove: async (key: string) => { delete values[key]; },
  } } });
  await probeNativeSetup();
  vi.setSystemTime(30_000); await probeNativeSetup();
  vi.resetModules();
  const reloaded = await import('./native-setup.js');
  vi.setSystemTime(60_000); await reloaded.probeNativeSetup();
  expect(sendNativeMessage).toHaveBeenCalledTimes(2);
  await nativeSetup('pair', 'http://localhost:1234/');
  expect(sendNativeMessage).toHaveBeenCalledTimes(3);
  vi.setSystemTime(90_000); await reloaded.probeNativeSetup();
  expect(sendNativeMessage).toHaveBeenCalledTimes(4);
  for (let index = 0; index < 10; index++) { vi.setSystemTime(1_000_000 + index * 300_000); await reloaded.probeNativeSetup(); }
  expect(values['agentonweb.native-probe-retry']).toEqual({ after: Date.now() + 300_000, delay: 300_000 });
});
it('keeps host launch tokens out of native pairing requests', async () => {
  const sendNativeMessage = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendNativeMessage } });
  expect(await nativeSetup('pair', 'http://localhost:1234/launch?token=secret')).toEqual({ ok: true, canPair: false });
  expect(sendNativeMessage).toHaveBeenCalledWith('com.agentonweb.terminal', { type: 'pair', expectedOrigin: 'http://localhost:1234' });
});
it('falls back to existing manual pairing when bridge is absent or rejects caller', async () => {
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendNativeMessage: vi.fn().mockRejectedValue(new Error('Missing host')) } });
  expect(await nativeSetup('probe')).toEqual({ ok: false });
});
