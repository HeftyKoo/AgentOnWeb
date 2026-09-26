import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let source: string;
const pages: JSDOM[] = [];
beforeAll(async () => {
  const result = await build({ entryPoints: [resolve("apps/extension/src/native-surface.ts")], bundle: true,
    write: false, format: "iife", platform: "browser" });
  source = result.outputFiles[0]!.text;
});
afterEach(() => { for (const page of pages.splice(0)) page.window.close(); });

async function page(scheme: string, nativeUrl = "http://localhost:3080/", authorized: boolean | Promise<{ ok: boolean }> = true) {
  const hash = new URLSearchParams({ url: nativeUrl, nonce: "test-nonce", parent: "https://example.org" });
  const dom = new JSDOM("<body></body>", { url: `${scheme}://test-extension/native-surface.html#${hash}`, runScripts: "outside-only" });
  pages.push(dom);
  Object.defineProperty(dom.window, "parent", { value: { postMessage: vi.fn() } });
  Object.assign(dom.window, { chrome: { runtime: { sendMessage: () => typeof authorized === "boolean" ? Promise.resolve({ ok: authorized }) : authorized } } });
  dom.window.eval(source);
  await Promise.resolve();
  await Promise.resolve();
  return dom.window;
}

describe("native workspace extension document", () => {
  it("announces wrapper readiness before authorization so presentation can be buffered", async () => {
    const hash = new URLSearchParams({ url: "http://localhost:3080/", nonce: "test-nonce", parent: "https://example.org" });
    const dom = new JSDOM("<body></body>", {
      url: `chrome-extension://test-extension/native-surface.html#${hash}`, runScripts: "outside-only",
    });
    pages.push(dom);
    Object.defineProperty(dom.window, "parent", { value: { postMessage: vi.fn() } });
    const post = vi.spyOn(dom.window.parent, "postMessage").mockImplementation(() => {});
    Object.assign(dom.window, { chrome: { runtime: { sendMessage: () => new Promise(() => {}) } } });
    dom.window.eval(source);
    expect(post).toHaveBeenCalledExactlyOnceWith({
      source: "agentonweb-surface", type: "surface.wrapper-ready", nonce: "test-nonce",
    }, "https://example.org");
    expect(dom.window.document.querySelector("iframe")).toBeNull();
  });
  it.each(["chrome-extension", "moz-extension", "safari-web-extension"])("loads native DSH and preserves its message contract under %s", async (scheme) => {
    const window = await page(scheme);
    const frame = window.document.querySelector("iframe")!;
    expect(window.document.documentElement.style.colorScheme).toBe("dark");
    expect(frame.src).toBe("http://localhost:3080/#agentonweb=test-nonce");
    const native = { postMessage: vi.fn() };
    Object.defineProperty(frame, "contentWindow", { value: native });
    const parentPost = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    const message = { source: "agentonweb-extension", type: "mode.set", mode: "chill", nonce: "test-nonce" };
    const emit = (data: object, origin = "https://example.org", sender: unknown = window.parent) =>
      window.dispatchEvent(new window.MessageEvent("message", { data, origin, source: sender as Window }));
    emit(message, "https://attacker.example");
    emit(message, undefined, {});
    emit({ ...message, nonce: "wrong" });
    emit({ ...message, type: "runtime.connect" });
    emit({ ...message, mode: "invalid" });
    expect(native.postMessage).not.toHaveBeenCalled();
    emit(message);
    const opacity = { ...message, type: "opacity.set", opacity: 0.4 };
    emit(opacity);
    emit({ ...opacity, opacity: 2 });
    expect(native.postMessage).not.toHaveBeenCalled();
    native.postMessage.mockClear();
    frame.dispatchEvent(new window.Event("load"));
    expect(native.postMessage.mock.calls).toEqual([[{ source: "agentonweb-extension", type: "surface.ready", nonce: "test-nonce" }, "http://localhost:3080"], [message, "http://localhost:3080"], [opacity, "http://localhost:3080"]]);
    const option = { source: "agentonweb-surface", type: "site-pass.option-tap", nonce: "test-nonce" };
    emit(option, "http://localhost:3080", {});
    emit(option, "https://attacker.example", native);
    expect(parentPost).not.toHaveBeenCalled();
    emit(option, "http://localhost:3080", native);
    expect(parentPost).toHaveBeenCalledWith(option, "https://example.org");
  });
  it("does not embed a remote workspace", async () => {
    expect((await page("chrome-extension", "https://attacker.example/")).document.querySelector("iframe")).toBeNull();
  });

  it("buffers the parent's initial presentation while background authorization is pending", async () => {
    let approve!: (result: { ok: boolean }) => void;
    const authorization = new Promise<{ ok: boolean }>(resolve => { approve = resolve; });
    const window = await page("chrome-extension", "http://localhost:3080/", authorization);
    expect(window.document.querySelector("iframe")).toBeNull();
    const mode = { source: "agentonweb-extension", type: "mode.set", mode: "chill", nonce: "test-nonce" };
    const opacity = { source: "agentonweb-extension", type: "opacity.set", opacity: 0.6, nonce: "test-nonce" };
    for (const data of [mode, opacity]) window.dispatchEvent(new window.MessageEvent("message", {
      data, origin: "https://example.org", source: window.parent,
    }));
    approve({ ok: true });
    await vi.waitFor(() => expect(window.document.querySelector("iframe")).not.toBeNull());
    const frame = window.document.querySelector("iframe")!;
    const native = { postMessage: vi.fn() };
    Object.defineProperty(frame, "contentWindow", { value: native });
    frame.dispatchEvent(new window.Event("load"));
    expect(native.postMessage.mock.calls).toEqual([
      [{ source: "agentonweb-extension", type: "surface.ready", nonce: "test-nonce" }, "http://localhost:3080"],
      [mode, "http://localhost:3080"],
      [opacity, "http://localhost:3080"],
    ]);
  });
});

it("does not load an iframe forged by a webpage without the background lease", async () => { expect((await page("chrome-extension", "http://localhost:3080/", false)).document.querySelector("iframe")).toBeNull(); });

it("shows a recoverable authorization failure and requires approval again on retry", async () => {
  const window = await page("chrome-extension", "http://localhost:3080/", false);
  expect(window.document.body.textContent).toContain('authorization');
  const sendMessage = vi.fn(async () => ({ ok: true }));
  Object.assign(window, { chrome: { runtime: { sendMessage } } });
  window.document.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(() => expect(window.document.querySelector('iframe')).not.toBeNull());
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'surface.authorize', nonce: 'test-nonce' }));
  expect(window.parent.postMessage).toHaveBeenCalledWith({ source: 'agentonweb-surface', type: 'surface.wrapper-retry', nonce: 'test-nonce' }, 'https://example.org');
  expect(window.document.querySelector('button')).toBeNull();
});

it("keeps the workspace blocked when retry is denied or the background is unavailable", async () => {
  const window = await page("chrome-extension", "http://localhost:3080/", false);
  for (const sendMessage of [async () => ({ ok: false }), async () => { throw new Error('Worker unavailable'); }]) {
    Object.assign(window, { chrome: { runtime: { sendMessage } } });
    const button = window.document.querySelector<HTMLButtonElement>('button')!;
    button.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(window.document.body.textContent).toContain('authorization');
    expect(window.document.querySelector('iframe')).toBeNull();
  }
});

it("buffers terminal activation until native load and forwards authenticated acknowledgements", async () => {
  const window = await page("chrome-extension");
  const frame = window.document.querySelector("iframe")!;
  const native = { postMessage: vi.fn() };
  Object.defineProperty(frame, "contentWindow", { value: native });
  const activation = { source: "agentonweb-extension", type: "terminal.activate", terminalId: "two", requestId: "click-2", nonce: "test-nonce" };
  const emit = (data: object, origin: string, source: unknown) => window.dispatchEvent(new window.MessageEvent("message", { data, origin, source: source as Window }));
  emit(activation, "https://attacker.example", window.parent);
  frame.dispatchEvent(new window.Event("load"));
  expect(native.postMessage).not.toHaveBeenCalledWith(activation, expect.anything());
  emit(activation, "https://example.org", window.parent);
  expect(native.postMessage).toHaveBeenCalledWith(activation, "http://localhost:3080");
  const parentPost = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
  const ack = { source: "agentonweb-surface", type: "terminal.activated", nonce: "test-nonce", requestId: "click-2", ok: true };
  emit(ack, "https://attacker.example", native);
  expect(parentPost).not.toHaveBeenCalled();
  emit(ack, "http://localhost:3080", native);
  expect(parentPost).toHaveBeenCalledWith(ack, "https://example.org");
  native.postMessage.mockClear();
  frame.dispatchEvent(new window.Event("load"));
  expect(native.postMessage).not.toHaveBeenCalledWith(activation, expect.anything());
});
