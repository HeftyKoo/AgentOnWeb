import { browser } from './browser-api.js';

const RETRY_KEY = 'agentonweb.native-probe-retry';
/** Persist cooldown across service-worker suspension; explicit pairing bypasses it. */
export async function probeNativeSetup(): Promise<{ ok: boolean; canPair?: boolean }> {
  const stored = (await browser.storage.session.get(RETRY_KEY))[RETRY_KEY] as { after?: number; delay?: number } | undefined;
  if (typeof stored?.after === 'number' && Date.now() < stored.after) return { ok: false };
  const delay = Math.min(Math.max(stored?.delay ?? 15_000, 15_000) * 2, 300_000);
  // Record the attempt before launching the native helper.
  await browser.storage.session.set({ [RETRY_KEY]: { after: Date.now() + delay, delay } });
  const result = await nativeSetup('probe');
  if (result.ok && result.canPair) await browser.storage.session.remove(RETRY_KEY);
  return result;
}

export async function nativeSetup(type: 'probe' | 'pair', url?: string): Promise<{ ok: boolean; canPair?: boolean }> {
  try {
    if (typeof browser.runtime.sendNativeMessage !== 'function') return { ok: false };
    const result: unknown = await browser.runtime.sendNativeMessage('com.agentonweb.terminal', {
      type, ...(url ? { expectedOrigin: new URL(url).origin } : {}),
    });
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) return { ok: false };
    return { ok: true, canPair: 'canPair' in result && result.canPair === true };
  } catch { return { ok: false }; }
}
