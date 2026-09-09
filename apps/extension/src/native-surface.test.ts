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

function page(scheme: string, nativeUrl = "http://localhost:3080/") {
  const hash = new URLSearchParams({ url: nativeUrl, nonce: "test-nonce", parent: "https://example.org" });
  const dom = new JSDOM("<body></body>", { url: `${scheme}://test-extension/native-surface.html#${hash}`, runScripts: "outside-only" });
  pages.push(dom);
  dom.window.eval(source);
  return dom.window;
}

describe("native workspace extension document", () => {
  it.each(["chrome-extension", "moz-extension", "safari-web-extension"])("loads native DSH and preserves its message contract under %s", (scheme) => {
    const window = page(scheme);
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
    expect(native.postMessage.mock.calls).toEqual([[message, "http://localhost:3080"], [opacity, "http://localhost:3080"]]);
    native.postMessage.mockClear();
    frame.dispatchEvent(new window.Event("load"));
    expect(native.postMessage.mock.calls).toEqual([[message, "http://localhost:3080"], [opacity, "http://localhost:3080"]]);
    const option = { source: "agentonweb-surface", type: "site-pass.option-tap", nonce: "test-nonce" };
    emit(option, "http://localhost:3080", {});
    emit(option, "https://attacker.example", native);
    expect(parentPost).not.toHaveBeenCalled();
    emit(option, "http://localhost:3080", native);
    expect(parentPost).toHaveBeenCalledWith(option, "https://example.org");
  });
  it("does not embed a remote workspace", () => {
    expect(page("chrome-extension", "https://attacker.example/").document.querySelector("iframe")).toBeNull();
  });
});
