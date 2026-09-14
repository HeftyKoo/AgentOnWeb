import type { Browser, browser as WxtBrowser } from "wxt/browser";

type BrowserApi = typeof WxtBrowser;

function currentBrowser(): BrowserApi {
  const globals = globalThis as typeof globalThis & { browser?: BrowserApi; chrome?: BrowserApi };
  const api = globals.browser?.runtime?.id ? globals.browser : globals.chrome;
  if (!api) throw new Error("WebExtension APIs are unavailable.");
  return api;
}

// Keep WXT's browser-first namespace contract without capturing a test or
// reloaded background global before the current extension context exists.
export const browser = new Proxy({} as BrowserApi, {
  get(_target, property) {
    return Reflect.get(currentBrowser(), property);
  },
});

export type { Browser };

export function extensionURL(path: string): string {
  return (browser.runtime as typeof browser.runtime & { getURL(path: string): string }).getURL(path);
}
