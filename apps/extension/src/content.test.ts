import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ContentRequest, StateUpdate, SurfaceCommand, SurfaceViewState } from "./shared.js";

let source: string;
const pages: JSDOM[] = [];
const idle: SurfaceViewState = { mode: "chill", connection: "disconnected", opacity: 0.6 };
const connected: SurfaceViewState = { ...idle, connection: "connected", surface: {
  runtimeId: "native-test", displayName: "Native test", url: "http://localhost:3080/", frameName: "agentonweb:test-nonce",
} };

beforeAll(async () => {
  // Exercise the production bundle, including its closed Shadow DOM and dock.
  const result = await build({ entryPoints: [resolve("apps/extension/src/content.tsx")],
    bundle: true, write: false, format: "iife", platform: "browser", target: "chrome132",
    loader: { ".css": "text", ".svg": "text", ".png": "dataurl" } });
  source = result.outputFiles[0]!.text;
});
afterEach(() => { for (const dom of pages.splice(0)) dom.window.close(); });

async function page(initial = idle, url = "https://example.org/", initialReply?: Promise<{ ok: boolean; result: SurfaceViewState }>, onRequest?: (request: ContentRequest) => void) {
  // No external resources are loaded. Only our bundled content script executes.
  const dom = new JSDOM('<button id="website-control">Website control</button>', { url, runScripts: "outside-only" });
  pages.push(dom);
  const { window } = dom;
  const { document } = window;
  const websiteControl = document.querySelector<HTMLButtonElement>("button")!;
  websiteControl.focus();
  let shadow!: ShadowRoot;
  const attachShadow = window.HTMLElement.prototype.attachShadow;
  vi.spyOn(window.HTMLElement.prototype, "attachShadow").mockImplementation(function (this: HTMLElement, options) {
    shadow = attachShadow.call(this, options); return shadow;
  });
  let receive!: (message: StateUpdate | SurfaceCommand) => void;
  const sendMessage = vi.fn(async (request: ContentRequest) => {
    onRequest?.(request);
    return initialReply ?? { ok: true, result: initial };
  });
  Object.assign(window, { chrome: { runtime: { getURL: (path: string) => `chrome-extension://test-extension${path}`, sendMessage, onMessage: { addListener(listener: typeof receive) { receive = listener; } } } } });
  window.eval(source);
  await Promise.resolve();
  const host = document.getElementById("agentonweb-extension-root")!;
  const frame = shadow.querySelector<HTMLIFrameElement>("iframe")!;
  const emit = (type: StateUpdate["type"] | SurfaceCommand["type"], state = initial) => receive({ source: "agentonweb-background", type, state });
  const escape = (target: { dispatchEvent(event: any): boolean }) => {
    const event = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  return { window, shadow, host, frame, websiteControl, sendMessage, emit, escape };
}

describe("page-local AgentOnWeb visibility", () => {
  it("remembers Close across reloads and cross-site navigation until explicitly reopened", async () => {
    let saved = { ...idle, dismissed: false };
    const openPage = (url: string) => page(saved, url, undefined, (request) => {
      if (request.type === "visibility.set") saved = { ...saved, dismissed: !request.visible };
    });
    const first = await openPage("https://example.org/");
    first.shadow.querySelector<HTMLButtonElement>('[aria-label="Close AgentOnWeb"]')!.click();
    for (const url of ["https://example.org/", "https://example.org/next", "https://example.net/"]) {
      const next = await openPage(url);
      expect(next.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(true);
      expect(next.shadow.querySelector<HTMLElement>(".surface-dock")!.hidden).toBe(false);
      next.emit("state.update", connected);
      expect(next.frame.hasAttribute("src")).toBe(false);
    }
    const reopened = await openPage("https://example.net/");
    reopened.emit("surface.show", { ...connected, dismissed: true });
    expect(reopened.frame.hidden).toBe(false);
    expect(saved.dismissed).toBe(false);
    expect((await openPage("https://example.net/next")).shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(false);
  });

  it("honors saved dismissal when a broadcast arrives before the initial reply", async () => {
    const p = await page(idle, undefined, new Promise(() => {}));
    p.emit("state.update", { ...connected, dismissed: true });
    expect(p.frame.hasAttribute("src")).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(true);
    p.emit("surface.toggle", { ...connected, dismissed: true });
    expect(p.frame.hidden).toBe(false);
  });

  it("keeps the native workspace opaque when the website styles all divs", async () => {
    const p = await page({ ...connected, mode: "focus" });
    const style = p.window.document.createElement("style");
    style.textContent = "div { opacity: 0.8; }";
    p.window.document.head.append(style);
    expect(p.window.getComputedStyle(p.host).opacity).toBe("1");
  });

  it("does not replace an explicitly opened workspace with a delayed initial snapshot", async () => {
    let reply!: (response: { ok: boolean; result: SurfaceViewState }) => void;
    const initialReply = new Promise<{ ok: boolean; result: SurfaceViewState }>((resolve) => { reply = resolve; });
    const p = await page(idle, undefined, initialReply);
    expect(p.host.hidden).toBe(true);
    p.emit("surface.show", connected);
    const source = p.frame.src;
    reply({ ok: true, result: idle });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.host.hidden).toBe(false);
    expect(p.frame.src).toBe(source);
    expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(true);
  });

  it("opens by default with the setup and collapsed lower-right dock", async () => {
    const p = await page();
    expect(p.host.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".surface-dock")!.hidden).toBe(false);
    expect(p.shadow.querySelector('[aria-label="Hide AgentOnWeb"]')).toBeNull();
    expect(p.frame.hasAttribute("src")).toBe(false);
    const connectedPage = await page(connected);
    expect(connectedPage.host.hidden).toBe(false);
    expect(connectedPage.frame.hidden).toBe(false);
    expect(new URL(connectedPage.frame.src).hostname).toBe("test-extension");
    expect(new URLSearchParams(new URL(connectedPage.frame.src).hash.slice(1)).get("url")).toBe("http://localhost:3080/");
  });

  it("waits for the native frame to load before posting presentation state", async () => {
    const p = await page();
    const postMessage = vi.fn();
    Object.defineProperty(p.frame, "contentWindow", { configurable: true, value: { postMessage } });
    p.emit("state.update", connected);
    expect(postMessage).not.toHaveBeenCalled();
    p.frame.dispatchEvent(new p.window.Event("load"));
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("hides the complete mounted frame in Watch while retaining its browsing context", async () => {
    const p = await page(connected);
    const src = p.frame.src;
    p.emit("state.update", { ...connected, mode: "watch" });
    expect(p.frame.hidden).toBe(true);
    expect(p.frame.src).toBe(src);
    p.emit("state.update", { ...connected, mode: "focus" });
    expect(p.frame.hidden).toBe(false);
    expect(p.frame.src).toBe(src);
  });

  it("closes only the setup while keeping the dock, and does not reopen during reconnect", async () => {
    const p = await page();
    p.shadow.querySelector<HTMLButtonElement>('[aria-label="Close AgentOnWeb"]')!.click();
    expect(p.host.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(true);
    expect(p.shadow.querySelector<HTMLElement>(".surface-dock")!.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".agentonweb-root")!.dataset.active).toBe("false");
    expect(p.window.document.activeElement).toBe(p.websiteControl);
    p.emit("state.update", { ...idle, connection: "reconnecting" });
    p.emit("state.update", connected);
    expect(p.host.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".agentonweb-root")!.dataset.active).toBe("false");
    expect(p.frame.hasAttribute("src")).toBe(false);
    expect(p.window.document.activeElement).toBe(p.websiteControl);
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["state.get", "visibility.set"]);
    p.emit("surface.toggle", connected);
    expect(p.shadow.querySelector<HTMLElement>(".agentonweb-root")!.dataset.active).toBe("true");
    expect(p.frame.src).toContain("chrome-extension://test-extension/native-surface.html#");
  });

  it("toolbar hiding preserves a mounted workspace and keeps the dock", async () => {
    const focused = { ...connected, mode: "focus" as const };
    const p = await page(focused);
    const setSource = vi.spyOn(p.frame, "src", "set");
    const source = p.frame.src;
    p.emit("surface.toggle");
    expect(p.host.hidden).toBe(false);
    expect(p.frame.hidden).toBe(true);
    expect(p.shadow.querySelector<HTMLElement>(".surface-dock")!.hidden).toBe(false);
    const styles = p.shadow.querySelector("style")!.textContent!;
    expect(styles).toMatch(/\.agentonweb-root\[data-active="false"\]\s+\.surface-shell\s*\{[^}]*background:\s*transparent/du);
    p.emit("state.update");
    p.emit("surface.toggle");
    expect(p.frame.hidden).toBe(false);
    expect(p.frame.src).toBe(source);
    expect(p.shadow.querySelector("iframe")).toBe(p.frame);
    expect(setSource).not.toHaveBeenCalled();
    expect(p.host.dataset.mode).toBe("focus");
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["state.get", "visibility.set", "visibility.set"]);
  });

  it("dismisses the setup with Escape without removing the dock or handling website Escape", async () => {
    const p = await page();
    p.websiteControl.focus();
    expect(p.escape(p.websiteControl).defaultPrevented).toBe(false);
    expect(p.host.hidden).toBe(false);
    const close = p.shadow.querySelector<HTMLButtonElement>('[aria-label="Close AgentOnWeb"]')!;
    close.focus();
    expect(p.escape(close).defaultPrevented).toBe(true);
    expect(p.host.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(true);
    expect(p.shadow.querySelector<HTMLElement>(".surface-dock")!.hidden).toBe(false);
    expect(p.window.document.activeElement).toBe(p.websiteControl);
  });

  it("shows the setup for every mode while disconnected", async () => {
    const p = await page();
    for (const mode of ["Chill", "Focus", "Watch"]) {
      p.shadow.querySelector<HTMLButtonElement>('[aria-label="Close AgentOnWeb"]')!.click();
      expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(true);
      p.shadow.querySelector<HTMLButtonElement>('[aria-label="Expand AgentOnWeb controls"]')!.click();
      p.shadow.querySelector<HTMLButtonElement>(`[aria-label^="${mode} mode"]`)!.click();
      expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(false);
    }
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual([
      "state.get", "visibility.set", "visibility.set", "mode.set",
      "visibility.set", "visibility.set", "mode.set",
      "visibility.set", "visibility.set", "mode.set",
    ]);
  });

  it("shows a dismissible setup in Watch and never overlays native authorization pages", async () => {
    const p = await page({ ...idle, mode: "watch" });
    expect(p.host.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".surface-setup")!.hidden).toBe(false);
    expect(p.shadow.querySelector<HTMLElement>(".surface-dock")!.hidden).toBe(false);
    const native = await page({ ...idle, approvalUrl: "http://localhost:3080/approve" }, "http://localhost:3080/");
    expect(native.host.hidden).toBe(true);
    expect(native.window.document.activeElement).toBe(native.websiteControl);
  });
});
