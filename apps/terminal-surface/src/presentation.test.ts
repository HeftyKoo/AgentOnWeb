import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import type { Terminal as Xterm } from "@xterm/xterm";
import { afterEach, expect, it, vi } from "vitest";

let terminal: Xterm;
vi.mock("@xterm/xterm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@xterm/xterm")>();
  return { Terminal: class extends original.Terminal {
    constructor(options: ConstructorParameters<typeof original.Terminal>[0]) {
      super(options);
      terminal = this;
    }
  } };
});
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { activate() {} dispose() {} proposeDimensions() { return undefined; } } }));
let dom: JSDOM;
afterEach(() => {
  terminal?.dispose();
  dom?.window.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("makes streamed ANSI agent backgrounds translucent in Chill while preserving text, selection and Focus", async () => {
  dom = new JSDOM(await readFile(new URL("./index.html", import.meta.url), "utf8"), {
    url: "http://localhost:1234/#agentonweb=fixture", pretendToBeVisual: true,
  });
  for (const key of ["window", "document", "location", "sessionStorage", "navigator"]) vi.stubGlobal(key, (dom.window as any)[key]);
  vi.stubGlobal("self", dom.window);
  vi.stubGlobal("parent", dom.window);
  dom.window.matchMedia = (() => ({ addListener() {}, removeListener() {} })) as any;
  const context = { font: "", measureText: (text: string) => ({ width: text.length * 8, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 }) };
  vi.stubGlobal("OffscreenCanvas", class { getContext() { return context; } });
  vi.spyOn(dom.window.HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.useFakeTimers({ toFake: ["setInterval"] });
  let socket: any;
  vi.stubGlobal("WebSocket", class {
    static OPEN = 1; readyState = 1; onmessage?: (event: any) => void;
    constructor() { socket = this; }
    send() {} close() {}
  });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(
    path === "/api/terminals" ? [{ id: "fixture", name: "Fixture" }] : path.startsWith("/ticket") ? { token: "fixture" } : { pending: [], grants: [] },
  )));
  await import("./main.js");
  await vi.waitFor(() => expect(socket).toBeDefined());
  const emit = (type: string, extra: object) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
    source: dom.window as unknown as Window, origin: "chrome-extension://fixture",
    data: { source: "agentonweb-extension", nonce: "fixture", type, ...extra },
  }));
  const presentation = (mode: string, opacity: number) => {
    emit("mode.set", { mode }); emit("opacity.set", { opacity });
  };
  const sample = (text: string) => {
    const element = [...dom.window.document.querySelectorAll<HTMLElement>(".xterm-rows span")].find(el => el.textContent?.includes(text));
    expect(element, text).toBeDefined();
    return dom.window.getComputedStyle(element!);
  };
  const output = "\x1b[38;2;241;243;245m\x1b[48;2;32;71;51mTruecolor\x1b[K\x1b[0m\r\n\x1b[42mANSI\x1b[K\x1b[0m\r\n\x1b[48;5;22mPalette\x1b[K\x1b[0m\r\n\x1b[7mInverse\x1b[0m\r\nPlain text";
  presentation("chill", 0.4);
  socket.onmessage({ data: JSON.stringify({ type: "snapshot", epoch: "fixture", cols: 80, rows: 24, data: output }) });
  await vi.waitFor(() => {
    expect(sample("Truecolor").backgroundColor).toBe("rgba(32, 71, 51, 0.4)");
    expect(sample("ANSI").backgroundColor).toBe("rgba(78, 154, 6, 0.4)");
    expect(sample("Palette").backgroundColor).toBe("rgba(0, 95, 0, 0.4)");
    expect(sample("Inverse").backgroundColor).toBe("rgba(241, 243, 245, 0.4)");
  });
  expect(sample("Truecolor").color).toBe("rgb(241, 243, 245)");
  expect(sample("Plain text").backgroundColor).toBe("rgba(0, 0, 0, 0)");
  presentation("chill", 0.2);
  await vi.waitFor(() => expect(sample("Truecolor").backgroundColor).toBe("rgba(32, 71, 51, 0.2)"));
  socket.onmessage({ data: JSON.stringify({ type: "output", epoch: "fixture", sequence: 1, data: "\r\n\x1b[48;2;40;50;60mStreamed\x1b[0m" }) });
  await vi.waitFor(() => expect(sample("Streamed").backgroundColor).toBe("rgba(40, 50, 60, 0.2)"));
  terminal.select(0, 0, 9);
  await vi.waitFor(() => expect(dom.window.document.querySelector(".xterm-decoration-top")).not.toBeNull());
  expect(sample("Truecolor").backgroundColor).toMatch(/^rgb\(/u);
  terminal.clearSelection();
  presentation("focus", 0.2);
  await vi.waitFor(() => expect(sample("Truecolor").backgroundColor).toBe("rgb(32, 71, 51)"));
  expect(sample("ANSI").backgroundColor).toBe("rgb(78, 154, 6)");
  expect(sample("Streamed").backgroundColor).toBe("rgb(40, 50, 60)");
  expect(terminal.buffer.active.getLine(0)?.getCell(0)?.getBgColor()).toBe(0x204733);
});
