import { JSDOM } from "jsdom";
import type { Terminal } from "@xterm/xterm";
import { afterEach, expect, it, vi } from "vitest";
import { installCellBackgroundOpacity } from "./cell-backgrounds.js";

let dom: JSDOM;
afterEach(() => { dom?.window.close(); });
it("does no cell traversal for opaque output or unchanged presentation", () => {
  dom = new JSDOM('<main><div class="xterm-rows"><div><span style="background-color:rgb(32,71,51)">Text</span></div></div></main>');
  const container = dom.window.document.querySelector("main")!;
  let render!: (range: { start: number; end: number }) => void;
  const setOpacity = installCellBackgroundOpacity({ onRender(fn: typeof render) { render = fn; } } as Terminal, container);
  const query = vi.spyOn(container, "querySelector");
  for (let i = 0; i < 100; i++) render({ start: 0, end: 0 });
  setOpacity(1);
  expect(query).not.toHaveBeenCalled();
  setOpacity(0.4);
  query.mockClear();
  setOpacity(0.4);
  expect(query).not.toHaveBeenCalled();
  setOpacity(1);
  expect(container.querySelector("span")!.style.backgroundColor).toBe("rgb(32, 71, 51)");
  query.mockClear();
  render({ start: 0, end: 0 });
  expect(query).not.toHaveBeenCalled();
});
