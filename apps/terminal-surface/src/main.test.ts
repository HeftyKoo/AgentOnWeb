import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
const terminalMock = vi.hoisted(() => ({
  writes: [] as (() => void)[],
  input: undefined as ((data: string) => void) | undefined,
  binary: undefined as ((data: string) => void) | undefined,
}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    options: any = {};
    parser = { registerCsiHandler() {}, registerOscHandler() {} };
    loadAddon() {}
    open() {}
    focus() {}
    reset() {}
    resize() {}
    onData(callback: (data: string) => void) {
      terminalMock.input = callback;
    }
    onBinary(callback: (data: string) => void) {
      terminalMock.binary = callback;
    }
    write(_data: string, callback?: () => void) {
      if (callback) terminalMock.writes.push(callback);
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    proposeDimensions() {
      return { cols: 80, rows: 24 };
    }
  },
}));
let dom: JSDOM;
afterEach(() => {
  dom.window.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  terminalMock.writes.length = 0;
  terminalMock.input = terminalMock.binary = undefined;
});
it("ignores stale session lists and ACKs when switching shells, and keeps exited controls disabled", async () => {
  dom = new JSDOM(await readFile(new URL("./index.html", import.meta.url), "utf8"), {
    url: "http://localhost:1234/launch?token=one-time-setup",
  });
  for (const key of ["window", "document", "location", "sessionStorage"]) vi.stubGlobal(key, (dom.window as any)[key]);
  vi.stubGlobal("parent", dom.window);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
    },
  );
  vi.useFakeTimers({ toFake: ["setInterval"] });
  const sockets: any[] = [];
  vi.stubGlobal(
    "WebSocket",
    class {
      static OPEN = 1;
      readyState = 1;
      sent: any[] = [];
      onmessage?: (event: any) => void;
      constructor() {
        sockets.push(this);
      }
      send(data: string) {
        this.sent.push(JSON.parse(data));
      }
      close() {
        this.readyState = 3;
      }
    },
  );
  let resolveOld!: (response: Response) => void;
  let lists = 0;
  const ticketUrls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: any) => {
      if (path === "/api/connections") return new Response("", { status: 403 });
      if (path === "/api/terminals" && options.method === "POST") return Response.json({ id: "two" });
      if (path === "/api/terminals") {
        lists++;
        if (lists === 2)
          return new Promise<Response>((resolve) => {
            resolveOld = resolve;
          });
        return Response.json(
          lists === 1
            ? [{ id: "one", name: "One" }]
            : [
                { id: "one", name: "One" },
                { id: "two", name: "Two" },
              ],
        );
      }
      ticketUrls.push(path);
      return Response.json({ token: "token", executable: "/bin/sh", cwd: "/" });
    }),
  );
  await import("./main.js");
  expect(dom.window.location.href).toBe("http://localhost:1234/");
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  const message = (socket: any, value: object) => socket.onmessage({ data: JSON.stringify(value) });
  message(sockets[0], {
    type: "snapshot",
    epoch: "old",
    cols: 80,
    rows: 24,
    data: "",
  });
  terminalMock.writes.shift()!();
  message(sockets[0], {
    type: "control",
    epoch: "old",
    lease: 1,
    active: true,
  });
  expect(dom.window.document.querySelector<HTMLElement>("#connection-notice")!.hidden).toBe(true);
  terminalMock.binary!("\x1b[M\x20\x80\x40");
  terminalMock.input!("世界 👋");
  expect(sockets[0].sent).toContainEqual({
    type: "input-binary",
    data: "\x1b[M\x20\x80\x40",
    epoch: "old",
    lease: 1,
  });
  expect(sockets[0].sent).toContainEqual({
    type: "input",
    data: "世界 👋",
    epoch: "old",
    lease: 1,
  });
  message(sockets[0], {
    type: "output",
    epoch: "old",
    sequence: 123,
    data: "old output",
  });
  const lateAck = terminalMock.writes.shift()!;
  const reconnect = dom.window.document.querySelector<HTMLButtonElement>(".tab-reconnect")!;
  expect(reconnect.hidden).toBe(true);
  expect(reconnect.disabled).toBe(true);
  sockets[0].onclose({ code: 1006 });
  expect(reconnect.hidden).toBe(false);
  expect(reconnect.disabled).toBe(false);
  reconnect.click();
  expect(reconnect.disabled).toBe(true);
  await vi.waitFor(() => expect(lists).toBe(2));
  dom.window.document.querySelector<HTMLButtonElement>("#new")!.click();
  await vi.waitFor(() => expect(sockets).toHaveLength(2));
  resolveOld(Response.json([{ id: "one", name: "One" }]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(dom.window.document.querySelector<HTMLButtonElement>('#sessions [aria-pressed="true"]')!.dataset.session).toBe("two");
  expect(ticketUrls.at(-1)).toBe("/ticket?session=two");
  lateAck();
  expect(sockets[1].sent).toEqual([]);
  message(sockets[1], {
    type: "snapshot",
    epoch: "new",
    cols: 80,
    rows: 24,
    data: "",
    exitCode: 0,
  });
  message(sockets[1], {
    type: "control",
    epoch: "new",
    lease: 1,
    active: false,
    exited: 0,
  });
  terminalMock.writes.shift()!();
  expect(dom.window.document.querySelector<HTMLButtonElement>("#control")!.disabled).toBe(true);
  expect(dom.window.document.querySelector<HTMLElement>("#connection-notice")!.hidden).toBe(false);
  dom.window.document.querySelector<HTMLButtonElement>('.tab-select[data-session="one"]')!.click();
  await vi.waitFor(() => expect(sockets).toHaveLength(3));
  expect(ticketUrls.at(-1)).toBe("/ticket?session=one");
  expect(dom.window.document.querySelector('.tab-select[data-session="one"]')!.getAttribute("aria-pressed")).toBe("true");
  const notice = dom.window.document.querySelector<HTMLElement>("#connection-notice")!;
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
  sockets[2].onclose({ code: 1006 });
  const disconnected = notice.textContent;
  expect(dom.window.document.querySelector('.terminal-tab[data-session="one"]')!.getAttribute("data-state")).toBe("disconnected");
  await vi.advanceTimersByTimeAsync(1500);
  await vi.waitFor(() => expect(sockets).toHaveLength(4));
  expect(notice.textContent).toBe(disconnected);
  expect(dom.window.document.querySelector('.terminal-tab[data-session="one"]')!.getAttribute("data-state")).toBe("connecting");
  expect(dom.window.document.querySelector<HTMLButtonElement>('.terminal-tab[data-session="one"] .tab-reconnect')!.disabled).toBe(true);
  expect(dom.window.document.querySelector("#terminal-actions")).toBeNull();
  expect(dom.window.document.querySelector('#status[role="status"], #status[aria-live]')).toBeNull();
});

it("closes a shell with in-page confirmation when browser confirm is blocked", async () => {
  dom = new JSDOM(await readFile(new URL("./index.html", import.meta.url), "utf8"), {
    url: "http://localhost:1234/#agentonweb=test",
  });
  for (const key of ["window", "document", "location", "sessionStorage"]) vi.stubGlobal(key, (dom.window as any)[key]);
  const parentWindow = { postMessage: vi.fn() };
  vi.stubGlobal("parent", parentWindow);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
    },
  );
  vi.stubGlobal(
    "WebSocket",
    class {
      static OPEN = 1;
      close() {}
    },
  );
  const browserConfirm = vi.fn(() => false);
  vi.stubGlobal("confirm", browserConfirm);
  // jsdom does not implement dialog opening/closing; native browsers do.
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new dom.window.Event("close"));
  };
  let resolveClose!: (response: Response) => void;
  const mutations: object[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: any) => {
      if (options?.method === "POST") {
        mutations.push(JSON.parse(options.body));
        return new Promise<Response>((resolve) => {
          resolveClose = resolve;
        });
      }
      if (path === "/api/terminals") return Response.json([{ id: "one", name: "One" }]);
      return Response.json({ token: "token", executable: "/bin/sh", cwd: "/" });
    }),
  );
  await import("./main.js");
  dom.window.dispatchEvent(
    new dom.window.MessageEvent("message", {
      source: parentWindow as any,
      origin: "chrome-extension://test",
      data: {
        source: "agentonweb-extension",
        type: "surface.ready",
        nonce: "test",
      },
    }),
  );
  const button = (id: string) => dom.window.document.querySelector<HTMLButtonElement>(id)!;
  await vi.waitFor(() => expect(dom.window.document.querySelector<HTMLButtonElement>('#sessions [aria-pressed="true"]')!.dataset.session).toBe("one"));
  button(".tab-close").click();
  const dialog = dom.window.document.querySelector<HTMLDialogElement>("#close-dialog");
  expect(dialog?.open).toBe(true);
  expect(mutations).toEqual([]);
  button("#cancel-close").click();
  expect(dialog!.open).toBe(false);
  expect(mutations).toEqual([]);
  button(".tab-close").click();
  button("#confirm-close").click();
  button("#confirm-close").click();
  expect(mutations).toEqual([{ action: "close", id: "one" }]);
  const cancel = new dom.window.Event("cancel", { cancelable: true });
  dialog!.dispatchEvent(cancel);
  expect(cancel.defaultPrevented).toBe(true);
  resolveClose(Response.json({ error: "Temporary host error." }, { status: 500 }));
  await vi.waitFor(() => expect(button("#confirm-close").disabled).toBe(false));
  expect(dialog!.open).toBe(true);
  expect(dom.window.document.querySelector("#close-error")!.textContent).toBe("Temporary host error.");
  button("#confirm-close").click();
  expect(mutations).toEqual([
    { action: "close", id: "one" },
    { action: "close", id: "one" },
  ]);
  resolveClose(Response.json([]));
  await vi.waitFor(() => expect(dialog!.open).toBe(false));
  expect(browserConfirm).not.toHaveBeenCalled();
});

it("shows the host session-limit explanation after a rejected new terminal", async () => {
  dom = new JSDOM(await readFile(new URL("./index.html", import.meta.url), "utf8"), { url: "http://localhost:1234/" });
  for (const key of ["window", "document", "location", "sessionStorage"]) vi.stubGlobal(key, (dom.window as any)[key]);
  vi.stubGlobal("parent", {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          error: "Close an unused terminal before opening another (maximum 8).",
        },
        { status: 409 },
      ),
    ),
  );
  await import("./main.js");
  dom.window.document.querySelector<HTMLButtonElement>("#new")!.click();
  await vi.waitFor(() =>
    expect(dom.window.document.querySelector("#status")!.textContent).toContain(
      "Close an unused terminal before opening another (maximum 8).",
    ),
  );
});
