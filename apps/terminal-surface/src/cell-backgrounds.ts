import type { Terminal } from "@xterm/xterm";

// xterm's DOM renderer paints ANSI cell backgrounds independently of the theme
// background. Adjust only their rendered colors, leaving PTY attributes intact.
export function installCellBackgroundOpacity(terminal: Terminal, container: HTMLElement) {
  let opacity = 1;
  const originals = new WeakMap<HTMLElement, { inline: string; channels: string[] }>();
  function render(start = 0, end = Infinity) {
    const rows = container.querySelector(".xterm-rows")?.children;
    if (!rows) return;
    const palette = new Map<string, string>();
    for (let row = start; row <= end && row < rows.length; row++) {
      for (const cell of rows[row]!.querySelectorAll<HTMLElement>("span")) {
        // Preserve xterm's cursor and selection contrast.
        if (cell.matches(".xterm-cursor, .xterm-decoration-top")) continue;
        let original = originals.get(cell);
        if (opacity === 1) {
          if (original) {
            cell.style.backgroundColor = original.inline;
            originals.delete(cell);
          }
          continue;
        }
        if (!original) {
          const inline = cell.style.backgroundColor;
          let color = inline;
          if (!color) {
            const colorClass = [...cell.classList].find(name => name.startsWith("xterm-bg-"));
            if (!colorClass) continue;
            color = palette.get(colorClass) ?? container.ownerDocument.defaultView!.getComputedStyle(cell).backgroundColor;
            palette.set(colorClass, color);
          }
          const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/u.exec(color);
          if (!match || Number(match[4] ?? 1) === 0) continue;
          original = { inline, channels: match.slice(1) };
          originals.set(cell, original);
        }
        const [red, green, blue, alpha] = original.channels;
        const color = `rgba(${red}, ${green}, ${blue}, ${Number(alpha ?? 1) * opacity})`;
        if (cell.style.backgroundColor !== color) cell.style.backgroundColor = color;
      }
    }
  }
  terminal.onRender(({ start, end }) => render(start, end));
  return (nextOpacity: number) => {
    opacity = nextOpacity;
    render();
  };
}
