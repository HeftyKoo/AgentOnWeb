import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { installMouseSelection } from "./mouse-selection.js";

let dom: JSDOM;
afterEach(() => dom.window.close());
function fixture(mac = true) {
  dom = new JSDOM('<main><div class="xterm-screen"><span>Terminal</span></div><div class="xterm-viewport"></div></main>');
  const container = dom.window.document.querySelector("main")!;
  const text = container.querySelector("span")!;
  const terminal = { modes: { mouseTrackingMode: "drag" as "drag" | "none" }, focus: vi.fn() };
  installMouseSelection(terminal, container, mac);
  const received: MouseEvent[] = [];
  for (const type of ["mousedown", "mouseup"]) text.addEventListener(type, event => received.push(event as MouseEvent));
  const mouse = (type: string, options: MouseEventInit = {}, target: EventTarget = text) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 20, button: 0, buttons: type === "mouseup" ? 0 : 1, ...options });
    target.dispatchEvent(event);
    return event;
  };
  return { terminal, container, received, mouse };
}

it.each([true, false])("lets xterm select a plain drag, using its platform selection modifier (mac=%s)", mac => {
  const { mouse, received } = fixture(mac);
  mouse("mousedown");
  expect(received).toHaveLength(0);
  mouse("mousemove", { clientX: 30 });
  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({ type: "mousedown", clientX: 10, clientY: 20, altKey: mac, shiftKey: !mac });
  mouse("mousemove", { clientX: 40 });
  mouse("mouseup", { clientX: 40 });
  expect(received.map(event => event.type)).toEqual(["mousedown", "mouseup"]);
});

it("delivers an ordinary click and small trackpad jitter to the TUI as a matching press and release", () => {
  const { mouse, received } = fixture();
  mouse("mousedown");
  mouse("mousemove", { clientX: 11 });
  expect(received).toHaveLength(0);
  mouse("mouseup", { clientX: 11 });
  expect(received.map(event => [event.type, event.altKey, event.shiftKey, event.buttons])).toEqual([
    ["mousedown", false, false, 1], ["mouseup", false, false, 0],
  ]);
});

it("cancels an unfinished click on blur without sending a stale press", () => {
  const { mouse, received } = fixture();
  mouse("mousedown");
  dom.window.dispatchEvent(new dom.window.Event("blur"));
  mouse("mousemove", { clientX: 40 });
  expect(received).toHaveLength(0);
  mouse("mousedown");
  mouse("mouseup");
  expect(received.map(event => event.type)).toEqual(["mousedown", "mouseup"]);
});

it("preserves native shell selection, modified gestures, context clicks and scrollbar interaction", () => {
  const { mouse, received, terminal, container } = fixture();
  terminal.modes.mouseTrackingMode = "none";
  expect(mouse("mousedown").defaultPrevented).toBe(false);
  terminal.modes.mouseTrackingMode = "drag";
  for (const options of [{ shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { button: 2 }])
    expect(mouse("mousedown", options).defaultPrevented).toBe(false);
  expect(mouse("mousedown", {}, container.querySelector(".xterm-viewport")!).defaultPrevented).toBe(false);
  expect(received).toHaveLength(6);
});

it("lets xterm handle word and line selection immediately on double and triple clicks", () => {
  const { mouse, received } = fixture();
  for (const detail of [2, 3]) mouse("mousedown", { detail });
  expect(received.map(event => [event.detail, event.altKey])).toEqual([[2, true], [3, true]]);
});
