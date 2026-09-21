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
  let folder = "/projects/one";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: any) => {
      if (path === "/api/connections") return new Response("", { status: 403 });
      if (path.startsWith("/api/terminals?cwd=")) return Response.json({ id: path.split("=")[1], cwd: folder });
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
  const tab = dom.window.document.querySelector<HTMLElement>(".terminal-tab")!;
  tab.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  await vi.waitFor(() => expect(dom.window.document.querySelector("#folder-tooltip")!.textContent).toBe("/projects/one"));
  folder = "/projects/changed folder";
  tab.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  await vi.waitFor(() => expect(dom.window.document.querySelector("#folder-tooltip")!.textContent).toBe(folder));
  tab.dispatchEvent(new dom.window.MouseEvent("mouseleave"));
  expect(dom.window.document.querySelector<HTMLElement>("#folder-tooltip")!.hidden).toBe(true);
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
  const statusDot = dom.window.document.querySelector<HTMLElement>(".status-dot")!;
  expect(statusDot.title).toBe("Connected");
  tab.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  statusDot.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  expect(dom.window.document.querySelector<HTMLElement>("#folder-tooltip")!.hidden).toBe(true);
  expect(dom.window.document.querySelector<HTMLElement>("#connection-notice")!.hidden).toBe(true);
  Object.defineProperty(dom.window.document, "hidden", { value: false });
  const focused = vi.spyOn(dom.window.document, "hasFocus").mockReturnValue(true);
  const terminalElement = dom.window.document.querySelector<HTMLElement>("#terminal")!;
  Object.defineProperty(terminalElement, "clientWidth", { value: 800 });
  Object.defineProperty(terminalElement, "clientHeight", { value: 500 });
  dom.window.dispatchEvent(new dom.window.Event("focus"));
  expect(sockets[0].sent.at(-1)).toEqual({ type: "focus", epoch: "old" });
  message(sockets[0], { type: "control", epoch: "old", lease: 1, active: true, resizeOwner: true });
  expect(sockets[0].sent.at(-1)).toEqual({ type: "resize", cols: 80, rows: 24, epoch: "old", lease: 1 });
  focused.mockReturnValue(false);
  dom.window.dispatchEvent(new dom.window.Event("blur"));
  expect(sockets[0].sent.at(-1)).toEqual({ type: "blur", epoch: "old", lease: 1 });
  message(sockets[0], { type: "control", epoch: "old", lease: 1, active: true, resizeOwner: false });

  const paste = new dom.window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", { value: { items: [{ type: "image/png", kind: "file" }], files: [] } });
  dom.window.document.querySelector("#terminal")!.dispatchEvent(paste);
  expect(paste.defaultPrevented).toBe(true);
  expect(sockets[0].sent).toContainEqual({ type: "input", data: "\x16", epoch: "old", lease: 1 });
  const textPaste = new dom.window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(textPaste, "clipboardData", { value: { items: [{ type: "text/plain", kind: "string" }], files: [] } });
  dom.window.document.querySelector("#terminal")!.dispatchEvent(textPaste);
  expect(textPaste.defaultPrevented).toBe(false);
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
  expect(dom.window.document.querySelector<HTMLElement>(".status-dot")!.title).toBe("Disconnected");
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
  expect(dom.window.document.querySelector('.terminal-tab[data-session="one"]')).toBe(tab);
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
  expect(dom.window.document.querySelector("#control")).toBeNull();
  expect(dom.window.document.querySelector<HTMLElement>("#connection-notice")!.hidden).toBe(false);
  const picker = dom.window.document.querySelector<HTMLElement>("#sessions")!;
  const retainedTabs = [...picker.children];
  picker.scrollLeft = 25;
  dom.window.document.querySelector<HTMLButtonElement>('.tab-select[data-session="one"]')!.click();
  expect(tab.dataset.selected).toBe("true");
  await vi.waitFor(() => expect(sockets).toHaveLength(3));
  expect([...picker.children]).toEqual(retainedTabs);
  expect(picker.scrollLeft).toBe(25);
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
  const sentBefore = sockets[3].sent.length;
  const blockedPaste = new dom.window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(blockedPaste, "clipboardData", { value: { items: [{ type: "image/png" }], files: [] } });
  dom.window.document.querySelector("#terminal")!.dispatchEvent(blockedPaste);
  expect(sockets[3].sent).toHaveLength(sentBefore);
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

it("renames a background terminal without reconnecting and updates its close label", async () => {
  dom = new JSDOM(await readFile(new URL("./index.html", import.meta.url), "utf8"), { url: "http://localhost:1234/" });
  for (const key of ["window", "document", "location", "sessionStorage"]) vi.stubGlobal(key, (dom.window as any)[key]);
  vi.stubGlobal("parent", dom.window);
  vi.stubGlobal("ResizeObserver", class { observe() {} });
  vi.useFakeTimers({ toFake: ["setInterval"] });
  vi.spyOn(dom.window, "setInterval").mockImplementation((callback, delay) => setInterval(callback as () => void, delay) as unknown as number);
  let socket: any;
  const connect = vi.fn();
  vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { socket = this; connect(); } close() {} });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const list = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
  const changes: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, options: any) => {
    if (path === "/api/connections") return new Response("", { status: 403 });
    if (path === "/api/terminals") {
      if (options.method === "POST") {
        const change = JSON.parse(options.body); changes.push(change);
        list.find(item => item.id === change.id)!.name = change.name;
      }
      return Response.json(list);
    }
    return Response.json({ token: "token" });
  }));
  await import("./main.js");
  await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
  dom.window.document.querySelector('.tab-select[data-session="two"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "F2", bubbles: true }));
  const dialog = dom.window.document.querySelector<HTMLDialogElement>("#rename-dialog")!;
  expect(dialog.open).toBe(true);
  const input = dom.window.document.querySelector<HTMLInputElement>("#rename-name")!;
  expect(input.value).toBe("Two");
  dom.window.document.querySelector<HTMLButtonElement>("#cancel-rename")!.click();
  expect(dialog.open).toBe(false);
  const tab = dom.window.document.querySelector<HTMLElement>('.terminal-tab[data-session="two"]')!;
  const context = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 30 });
  tab.dispatchEvent(context);
  expect(context.defaultPrevented).toBe(true);
  const menu = dom.window.document.querySelector<HTMLElement>("#tab-menu")!;
  expect(menu.hidden).toBe(false);
  expect(dom.window.document.querySelector<HTMLElement>("#folder-tooltip")!.hidden).toBe(true);
  expect(dom.window.document.querySelector('.tab-select[aria-pressed="true"]')!.getAttribute("data-session")).toBe("one");
  menu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(menu.hidden).toBe(true);
  tab.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  dom.window.document.querySelector<HTMLButtonElement>("#tab-menu-rename")!.click();
  expect(menu.hidden).toBe(true);
  expect(dialog.open).toBe(true);
  expect(input.value).toBe("Two");
  input.value = "  API server  ";
  dom.window.document.querySelector("#rename-form")!.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(dialog.open).toBe(false));
  expect(changes).toEqual([{ action: "rename", id: "two", name: "API server" }]);
  Object.defineProperty(dom.window.document, "hidden", { value: false });
  list[0]!.name = "changed-directory";
  socket.onmessage({ data: JSON.stringify({ type: "session-names", sessions: list }) });
  const listGets = () => vi.mocked(fetch).mock.calls.filter(([url, options]) => url === "/api/terminals" && options?.method !== "POST").length;
  const requestsBeforeIdle = listGets();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(listGets()).toBe(requestsBeforeIdle);
  await vi.waitFor(() => expect(dom.window.document.querySelector('.terminal-tab[data-session="one"] .tab-name')!.textContent).toBe("changed-directory"));
  expect(connect).toHaveBeenCalledOnce();
  expect(dom.window.document.querySelector('.terminal-tab[data-session="two"] .tab-name')!.textContent).toBe("API server");
  expect(dom.window.document.querySelector('.terminal-tab[data-session="two"] .tab-close')!.getAttribute("aria-label")).toBe("Close API server");
});
