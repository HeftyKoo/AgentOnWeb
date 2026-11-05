import type { Terminal } from "@xterm/xterm";

function translucent(color: string, opacity: number): string | undefined {
  const hex = /^#([\da-f]{6})$/iu.exec(color);
  if (hex) {
    const value = Number.parseInt(hex[1]!, 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
  }
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/u.exec(color);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${Number(rgb[4] ?? 1) * opacity})`;
  return undefined;
}

// Palette backgrounds are shared CSS rules, so changing their opacity must not
// read computed styles and rewrite thousands of cells on every frame. Only
// truecolor backgrounds need per-cell work. PTY attributes stay untouched.
export function installCellBackgroundOpacity(terminal: Terminal, container: HTMLElement) {
  let opacity = 1;
  const originals = new WeakMap<HTMLElement, string>();
  const style = container.ownerDocument.createElement("style");
  container.append(style);
  let themeStyle: HTMLStyleElement | undefined;
  let observer: MutationObserver | undefined;
  function updatePalette() {
    const rules: string[] = [];
    if (opacity !== 1) {
      for (const rule of themeStyle?.sheet?.cssRules ?? []) {
        const css = rule as CSSStyleRule;
        if (!/\.xterm-bg-\d+$/u.test(css.selectorText ?? "")) continue;
        const color = translucent(css.style.getPropertyValue("background-color"), opacity);
        if (color) rules.push(`${css.selectorText}:not(.xterm-cursor):not(.xterm-decoration-top){background-color:${color}}`);
      }
    }
    const text = rules.join("\n");
    if (style.textContent !== text) style.textContent = text;
  }
  function ensurePalette() {
    if (themeStyle?.isConnected) return;
    observer?.disconnect();
    themeStyle = [...container.querySelectorAll<HTMLStyleElement>(".xterm-screen style")]
      .find(candidate => candidate.textContent?.includes(".xterm-bg-"));
    if (themeStyle) {
      observer = new container.ownerDocument.defaultView!.MutationObserver(updatePalette);
      observer.observe(themeStyle, { childList: true, characterData: true, subtree: true });
    }
    updatePalette();
  }
  function render(start = 0, end = Infinity) {
    const rows = container.querySelector(".xterm-rows")?.children;
    if (!rows) return;
    // Reuse conversions within each frame without retaining arbitrary RGB colors.
    const colors = new Map<string, string | undefined>();
    for (let row = start; row <= end && row < rows.length; row++) {
      for (const cell of rows[row]!.querySelectorAll<HTMLElement>('span[style*="background-color"]:not(.xterm-cursor):not(.xterm-decoration-top)')) {
        const saved = originals.get(cell);
        if (opacity === 1) {
          if (saved !== undefined) { cell.style.backgroundColor = saved; originals.delete(cell); }
          continue;
        }
        const original = saved ?? cell.style.backgroundColor;
        if (!colors.has(original)) colors.set(original, translucent(original, opacity));
        const color = colors.get(original);
        if (!color) continue;
        originals.set(cell, original);
        if (cell.style.backgroundColor !== color) cell.style.backgroundColor = color;
      }
    }
  }
  terminal.onRender(({ start, end }) => {
    if (opacity === 1) return;
    ensurePalette();
    render(start, end);
  });
  return (nextOpacity: number) => {
    if (nextOpacity === opacity) return;
    opacity = nextOpacity;
    ensurePalette();
    updatePalette();
    render();
  };
}
