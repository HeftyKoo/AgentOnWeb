import { createDock } from "./dock.js";
import { DEFAULT_SURFACE_OPACITY } from "./interaction.js";
import styles from "./overlay.css";
import type { SurfaceViewState } from "./shared.js";

const style = document.createElement("style");
style.textContent = styles;
document.head.append(style);

const container = document.getElementById("overcode-preview");
if (!container) throw new Error("Missing preview container");

container.className = "overcode-root";
const shell = document.createElement("section");
shell.className = "surface-shell";
const frame = document.createElement("iframe");
frame.className = "runtime-frame";
frame.title = "DeepSeek Harness native surface preview";
frame.src = new URL(location.href).searchParams.get("surface") ?? "about:blank";
const dock = createDock();
let state: SurfaceViewState = {
  mode: "watch",
  opacity: DEFAULT_SURFACE_OPACITY,
  connection: "connected",
};
const render = () => {
  container.dataset.mode = state.mode;
  container.style.setProperty("--overcode-surface-opacity", String(state.opacity));
  dock.render(state);
};
dock.onMode = (mode) => {
  state = { ...state, mode };
  render();
};
dock.onOpacity = (opacity) => {
  state = { ...state, opacity };
  render();
};
dock.onOpacityPreview = (opacity) => {
  container.style.setProperty("--overcode-surface-opacity", String(opacity));
};
dock.setExpanded(true);
shell.append(frame, dock.element);
container.append(shell);
render();
