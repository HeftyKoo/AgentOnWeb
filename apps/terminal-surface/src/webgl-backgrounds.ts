import type { Terminal } from "@xterm/xterm";
import type { WebglAddon } from "@xterm/addon-webgl";

interface Vertices { attributes: Float32Array; count: number }
interface RenderModel {
  selection: { hasSelection: boolean; isCellSelected(terminal: Terminal, x: number, y: number): boolean };
  cursor?: { x: number; y: number; width: number; style: string };
}
interface Rectangles {
  _vertices: Vertices;
  _renderVertices(vertices: Vertices): void;
  renderBackgrounds(): void;
}
interface Renderer {
  _gl: WebGL2RenderingContext;
  _model: RenderModel;
  _rectangleRenderer: { value?: Rectangles };
  renderRows(start: number, end: number): void;
}

/**
 * Compatibility boundary for the pinned xterm 5.5.0 / WebGL addon 0.18.0.
 * The public addon only supports transparency for the default background; its
 * ANSI/truecolor rectangles always have alpha=1. Adapt that draw batch, not the
 * terminal buffer or glyph atlas. No DOM cells are created or inspected.
 *
 * Vertex layout: normalized x/y/width/height, then RGBA (8 floats). The first
 * rectangle is the viewport background; in Chill the viewport's CSS already
 * paints it, so the GPU layer must not paint it a second time.
 * Check this boundary and the real-browser pixel test before upgrading xterm.
 */
export function installWebglBackgroundOpacity(addon: WebglAddon, terminal: Terminal) {
  const renderer = (addon as unknown as { _renderer?: Renderer })._renderer;
  const supported = (rectangles: Rectangles | undefined): rectangles is Rectangles => Boolean(
    rectangles && rectangles._vertices?.attributes instanceof Float32Array
    && typeof rectangles._renderVertices === "function" && typeof rectangles.renderBackgrounds === "function",
  );
  if (!renderer || typeof renderer.renderRows !== "function"
    || typeof renderer._gl?.blendFuncSeparate !== "function"
    || typeof renderer._model?.selection?.isCellSelected !== "function"
    || !supported(renderer._rectangleRenderer?.value)) throw new Error("Unsupported WebGL background renderer");

  let opacity = 1;
  let rectangles: Rectangles | undefined;
  let scratch: Vertices = { attributes: new Float32Array(0), count: 0 };
  function attach() {
    const next = renderer!._rectangleRenderer.value;
    if (next === rectangles) return;
    if (!supported(next)) throw new Error("Unsupported restored WebGL background renderer");
    rectangles = next;
    const draw = next.renderBackgrounds;
    next.renderBackgrounds = () => {
      if (opacity === 1) { draw.call(next); return; }
      const source = next._vertices;
      // At most one rectangle per visible cell, plus the viewport. Reuse this
      // storage across scroll/selection frames; history length is irrelevant.
      const capacity = (terminal.cols * terminal.rows + 1) * 8;
      if (scratch.attributes.length < capacity) scratch = { attributes: new Float32Array(capacity), count: 0 };
      const target = scratch.attributes;
      const data = source.attributes;
      target.set(data.subarray(0, 8));
      target[7] = 0; // Default background comes from the viewport's CSS.
      scratch.count = source.count ? 1 : 0;
      const model = renderer!._model;
      const viewportY = terminal.buffer.active.viewportY;
      const cursor = model.cursor?.style === "block" ? model.cursor : undefined;
      const selected = model.selection.hasSelection;
      function emit(offset: number, start: number, end: number, alpha: number) {
        const output = scratch.count++ * 8;
        target[output] = start / terminal.cols;
        target[output + 1] = data[offset + 1]!;
        target[output + 2] = (end - start) / terminal.cols;
        for (let channel = 3; channel < 7; channel++) target[output + channel] = data[offset + channel]!;
        target[output + 7] = alpha;
      }
      for (let i = 8; i < source.count * 8; i += 8) {
        const row = Math.round(data[i + 1]! * terminal.rows);
        const start = Math.round(data[i]! * terminal.cols);
        const end = Math.round((data[i]! + data[i + 2]!) * terminal.cols);
        const alpha = data[i + 7]!;
        if (!selected && cursor?.y !== row) { emit(i, start, end, alpha * opacity); continue; }
        // Split at selection/cursor boundaries even if their color happens to
        // equal the surrounding ANSI background and xterm merged the rectangles.
        let segment = start;
        let previous = -1;
        for (let x = start; x < end; x++) {
          const opaque = (selected && model.selection.isCellSelected(terminal, x, row + viewportY))
            || (cursor?.y === row && x >= cursor.x && x < cursor.x + cursor.width);
          const nextAlpha = opaque ? alpha : alpha * opacity;
          if (previous !== -1 && nextAlpha !== previous) { emit(i, segment, x, previous); segment = x; }
          previous = nextAlpha;
        }
        if (end > start) emit(i, segment, end, previous);
      }
      next._renderVertices(scratch);
    };
  }
  attach();
  // WebGL can restore a context without recreating the addon. Reattach to its
  // new rectangle renderer before the first restored frame is drawn.
  const renderRows = renderer.renderRows;
  renderer.renderRows = (start, end) => {
    attach();
    if (opacity === 1) { renderRows.call(renderer, start, end); return; }
    const gl = renderer._gl;
    // With transparent rectangles, source alpha must not be multiplied by
    // itself. Clear instead of blending another background over the last frame.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    try { renderRows.call(renderer, start, end); }
    finally { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
  };
  return (nextOpacity: number) => {
    if (opacity === nextOpacity) return;
    opacity = nextOpacity;
    terminal.refresh(0, terminal.rows - 1);
  };
}
