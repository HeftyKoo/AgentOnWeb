import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("DeepSeek Harness surface client", () => {
  it("forwards one authenticated Option tap and ignores key repeat", async () => {
    const source = await readFile(new URL("./lib/client.js", import.meta.url), "utf8");
    const listeners = new Map<string, (event: any) => void>();
    const parent = { postMessage: vi.fn() };
    const disposeTheme = vi.fn();
    const overrideTokens = vi.fn(() => disposeTheme);
    let plugin: { apply: (context: unknown) => void } | undefined;
    let cleanup = () => {};
    const window = {
      __ModuleLoader__: {
        load(entry: { factory: () => { apply: (context: unknown) => void } }) {
          plugin = entry.factory();
        },
      },
      location: { hash: "#overcode=frame-nonce" },
      name: "",
      parent,
      addEventListener(type: string, listener: (event: any) => void) {
        listeners.set(type, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    };

    runInNewContext(source, { window, URLSearchParams });
    expect(plugin).toBeDefined();
    plugin?.apply({
      theme: { overrideTokens },
      effect(setup: () => () => void) {
        cleanup = setup();
      },
    });

    listeners.get("keydown")?.({ key: "Alt", repeat: false });
    expect(parent.postMessage).toHaveBeenCalledOnce();
    expect(parent.postMessage).toHaveBeenCalledWith({
      source: "overcode-surface",
      type: "site-pass.option-tap",
      nonce: "frame-nonce",
    }, "*");

    listeners.get("keydown")?.({ key: "Alt", repeat: true });
    expect(parent.postMessage).toHaveBeenCalledOnce();
    expect(listeners.has("keyup")).toBe(false);

    const forgedMessage = { source: "overcode-extension", type: "opacity.set", nonce: "frame-nonce", opacity: 0.2 };
    listeners.get("message")?.({ source: {}, data: forgedMessage });
    listeners.get("message")?.({ source: parent, data: { ...forgedMessage, nonce: "wrong-frame" } });
    expect(overrideTokens).toHaveBeenCalledOnce();

    listeners.get("message")?.({
      source: parent,
      data: {
        source: "overcode-extension",
        type: "opacity.set",
        nonce: "frame-nonce",
        opacity: 0.72,
      },
    });
    expect(disposeTheme).toHaveBeenCalledOnce();
    expect(overrideTokens).toHaveBeenLastCalledWith("overcode-surface", expect.objectContaining({
      "--dsw-alias-bg-base": {
        light: "rgba(245, 247, 250, 0.72)",
        dark: "rgba(9, 12, 16, 0.72)",
      },
    }));

    cleanup();
    expect(listeners.has("keydown")).toBe(false);
  });

  it("adds authorization only to native top-level slots without changing the native theme", async () => {
    const source = await readFile(new URL("./lib/client.js", import.meta.url), "utf8");
    let plugin: { apply(context: unknown): void } | undefined;
    const require = vi.fn(() => ({ createElement: vi.fn() }));
    const window: any = {
      __ModuleLoader__: { load(entry: { factory(require: unknown): typeof plugin }) { plugin = entry.factory(require); } },
      location: { hash: "" }, name: "", addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    window.parent = window;
    const overrideTokens = vi.fn();
    const register = vi.fn();
    const cleanups: (() => void)[] = [];
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ pending: [], grants: [] }) }));
    const clearInterval = vi.fn();
    runInNewContext(source, { window, URLSearchParams, fetch, setInterval: vi.fn(() => 1), clearInterval });
    plugin?.apply({
      theme: { overrideTokens },
      slots: { inject: (_name: string, setup: () => void) => setup(), register },
      effect(setup: () => () => void) { cleanups.push(setup()); },
    });
    expect(overrideTokens).not.toHaveBeenCalled();
    expect(require).toHaveBeenCalledWith("react");
    expect(register.mock.calls.map(([entry]) => entry.name)).toEqual(["shell.overlay", "settings.section"]);
    expect(fetch).toHaveBeenCalledWith("/api/overcode/connections", { cache: "no-store" });
    expect(register.mock.calls.some(([entry]) => /session|conversation|tool/.test(entry.name))).toBe(false);
    for (const cleanup of cleanups) cleanup();
    expect(clearInterval).toHaveBeenCalledWith(1);
  });

  it("restores the native selection in a new website partition and saves native selection changes", async () => {
    const harness = await nativeViewHarness();
    harness.start();
    await vi.waitFor(() => expect(harness.sessions.open).toHaveBeenCalledWith("saved-session"));
    expect(harness.fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    harness.select("another-session");
    await vi.waitFor(() => expect(harness.bookmark()).toEqual({ sessionId: "another-session" }));
    expect(harness.fetch).toHaveBeenCalledWith("/api/overcode/native-view", expect.objectContaining({ keepalive: true }));
    harness.stop();
    harness.fetch.mockClear(); harness.select("saved-session");
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it("does not override a user selection made while restoring the bookmark", async () => {
    const harness = await nativeViewHarness();
    let resolve!: (response: any) => void;
    harness.fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    harness.start(); await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.select("another-session");
    resolve({ ok: true, json: async () => ({ selection: { sessionId: "saved-session" } }) });
    await vi.waitFor(() => expect(harness.bookmark()).toEqual({ sessionId: "another-session" }));
    expect(harness.sessions.open).not.toHaveBeenCalled();
    harness.stop();
  });
});

async function nativeViewHarness() {
  const source = await readFile(new URL("./lib/client.js", import.meta.url), "utf8");
  let plugin: { apply(context: unknown): void } | undefined;
  let bookmark: any = { sessionId: "saved-session" };
  const state = { current: "partition-session", currentAddress: undefined, phase: "ready",
    byId: { "partition-session": {}, "saved-session": {}, "another-session": {} } };
  const listeners = new Set<() => void>();
  const select = (id: string) => { state.current = id; listeners.forEach((listener) => listener()); };
  const sessions = {
    list: { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } },
    refresh: vi.fn(async () => {}), open: vi.fn(select), clear: vi.fn(),
  };
  const fetch = vi.fn(async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") bookmark = JSON.parse(init.body!);
    return { ok: true, json: async () => ({ selection: bookmark }) };
  });
  const window = {
    __ModuleLoader__: { load(entry: { factory(): typeof plugin }) { plugin = entry.factory(); } },
    location: { hash: "#overcode=frame-nonce" }, name: "", parent: { postMessage: vi.fn() },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  const cleanups: (() => void)[] = [];
  runInNewContext(source, { window, URLSearchParams, fetch, document: { addEventListener: vi.fn(), removeEventListener: vi.fn() } });
  return {
    fetch, sessions, select, bookmark: () => bookmark,
    start: () => plugin?.apply({ sessions, theme: { overrideTokens: () => () => {} }, effect: (setup: () => () => void) => cleanups.push(setup()) }),
    stop: () => cleanups.forEach((cleanup) => cleanup()),
  };
}
