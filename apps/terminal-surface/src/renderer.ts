import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";
import { installWebglBackgroundOpacity } from "./webgl-backgrounds.js";

/** Keep one GPU renderer across modes; use DOM only if GPU support fails. */
export function installRenderer(terminal: Terminal, setDomOpacity: (opacity: number) => void) {
  let addon: WebglAddon | undefined;
  let setGpuOpacity: ((opacity: number) => void) | undefined;
  let opacity = 1;
  let unavailable = typeof WebGL2RenderingContext === "undefined";
  return (nextOpacity: number) => {
    opacity = nextOpacity;
    if (unavailable) { setDomOpacity(opacity); return; }
    if (addon) { setGpuOpacity!(opacity); return; }
    let candidate: WebglAddon | undefined;
    try {
      candidate = new WebglAddon();
      candidate.onContextLoss(() => {
        unavailable = true;
        addon?.dispose();
        addon = undefined;
        setGpuOpacity = undefined;
        setDomOpacity(opacity);
      });
      terminal.loadAddon(candidate);
      setGpuOpacity = installWebglBackgroundOpacity(candidate, terminal);
      setGpuOpacity(opacity);
      addon = candidate;
    } catch {
      // Disabled GPUs and exhausted contexts must leave a usable DOM terminal.
      candidate?.dispose();
      unavailable = true;
      setDomOpacity(opacity);
    }
  };
}
