import { expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import type { WebglAddon } from "@xterm/addon-webgl";
import { installWebglBackgroundOpacity } from "./webgl-backgrounds.js";

function fixture() {
  const terminal = { cols: 8, rows: 2, buffer: { active: { viewportY: 1000 } }, refresh: vi.fn() };
  const source = new Float32Array([0, 0, 1, 1, 0.1, 0.2, 0.3, 0.4, 0, 0, 1, 0.5, 0.2, 0.3, 0.4, 1]);
  const makeRectangles = () => ({ _vertices: { attributes: source, count: 2 }, _renderVertices: vi.fn(), renderBackgrounds: vi.fn() });
  const rectangles = makeRectangles();
  const selection = { hasSelection: false, isCellSelected: (_terminal: unknown, x: number, y: number) => y === 1000 && x >= 2 && x < 4 };
  const model: { selection: typeof selection; cursor?: { x: number; y: number; width: number; style: string } } = { selection };
  const gl = { clearColor: vi.fn(), clear: vi.fn(), blendFuncSeparate: vi.fn(), blendFunc: vi.fn(),
    COLOR_BUFFER_BIT: 0x4000, SRC_ALPHA: 0x302, ONE_MINUS_SRC_ALPHA: 0x303, ONE: 1 };
  const renderer = { _gl: gl, _rectangleRenderer: { value: rectangles }, _model: model, renderRows: () => { renderer._rectangleRenderer.value.renderBackgrounds(); } };
  const addon = { _renderer: renderer };
  const setOpacity = installWebglBackgroundOpacity(addon as unknown as WebglAddon, terminal as unknown as Terminal);
  return { terminal, source, rectangles, selection, model, renderer, setOpacity, makeRectangles };
}

it("changes only background alpha and reuses its bounded viewport buffer", () => {
  const f = fixture();
  f.setOpacity(0.4);
  f.renderer.renderRows();
  const vertices = f.rectangles._renderVertices.mock.calls[0]![0];
  expect(vertices.count).toBe(2);
  expect(vertices.attributes[7]).toBe(0); // Do not double-paint the CSS background.
  expect(vertices.attributes[15]).toBeCloseTo(0.4);
  expect(f.source[15]).toBe(1); // Never mutate xterm's canonical draw data.
  expect(f.renderer._gl.blendFuncSeparate).toHaveBeenCalledWith(0x302, 0x303, 1, 0x303);
  f.renderer.renderRows();
  expect(f.rectangles._renderVertices.mock.calls[1]![0].attributes).toBe(vertices.attributes);
  f.setOpacity(1);
  expect(f.terminal.refresh).toHaveBeenCalledTimes(2);
  f.renderer.renderRows();
  expect(f.rectangles._renderVertices).toHaveBeenCalledTimes(2);
});

it("splits merged colors around selection and wide cursors without fading either", () => {
  const f = fixture();
  f.selection.hasSelection = true;
  f.model.cursor = { x: 5, y: 0, width: 2, style: "block" };
  f.setOpacity(0.2);
  f.renderer.renderRows();
  const { attributes, count } = f.rectangles._renderVertices.mock.calls[0]![0];
  const spans = Array.from({ length: count - 1 }, (_, index) => {
    const i = (index + 1) * 8;
    return [Math.round(attributes[i] * 8), Math.round(attributes[i + 2] * 8), Number(attributes[i + 7].toFixed(2))];
  });
  expect(spans).toEqual([[0, 2, 0.2], [2, 2, 1], [4, 1, 0.2], [5, 2, 1], [7, 1, 0.2]]);
});

it("reattaches after context restoration replaces the rectangle renderer", () => {
  const f = fixture();
  f.setOpacity(0.3);
  const restored = f.makeRectangles();
  f.renderer._rectangleRenderer.value = restored;
  f.renderer.renderRows();
  expect(restored._renderVertices.mock.calls[0]![0].attributes[15]).toBeCloseTo(0.3);
});

it("rejects incompatible addon internals so the caller can use the DOM fallback", () => {
  expect(() => installWebglBackgroundOpacity({} as WebglAddon, {} as Terminal)).toThrow("Unsupported");
});
