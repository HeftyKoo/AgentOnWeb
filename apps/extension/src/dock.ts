import chillIcon from "@phosphor-icons/core/regular/cloud-sun.svg";
import focusIcon from "@phosphor-icons/core/regular/crosshair-simple.svg";
import opacityIcon from "@phosphor-icons/core/regular/circle-half-tilt.svg";
import watchIcon from "@phosphor-icons/core/regular/eye.svg";
import type { OvercodeMode } from "@overcode/connector-contract";
import logoDataUrl from "./assets/overcode-mark.png";
import type { SurfaceViewState } from "./shared.js";

const MODE_META: ReadonlyArray<{
  readonly mode: OvercodeMode;
  readonly label: string;
  readonly shortcut: string;
  readonly icon: string;
}> = [
  { mode: "chill", label: "Chill", shortcut: "⌃⇧1", icon: chillIcon },
  { mode: "focus", label: "Focus", shortcut: "⌃⇧2", icon: focusIcon },
  { mode: "watch", label: "Watch", shortcut: "⌃⇧3", icon: watchIcon },
];

export interface SurfaceDock {
  readonly element: HTMLElement;
  onMode: (mode: OvercodeMode) => void;
  onOpacityPreview: (opacity: number) => void;
  onOpacity: (opacity: number) => void;
  focus: () => void;
  render: (state: SurfaceViewState) => void;
  setExpanded: (expanded: boolean) => void;
}

export function createDock(): SurfaceDock {
  const element = document.createElement("nav");
  element.className = "surface-dock";
  element.setAttribute("aria-label", "Overcode presentation controls");

  const palette = document.createElement("div");
  palette.className = "surface-palette";
  palette.id = "overcode-surface-palette";
  palette.hidden = true;

  const buttons = new Map<OvercodeMode, HTMLButtonElement>();
  const api: SurfaceDock = {
    element,
    onMode: (_mode: OvercodeMode) => {},
    onOpacityPreview: (_opacity: number) => {},
    onOpacity: (_opacity: number) => {},
    focus: () => toggle.focus({ preventScroll: true }),
    render(state) {
      for (const [mode, button] of buttons) {
        button.setAttribute("aria-pressed", String(state.mode === mode));
      }
      opacityInput.value = String(Math.round(state.opacity * 100));
      opacityInput.disabled = state.runtime?.capabilities.translucency === false;
      opacityValue.value = `${Math.round(state.opacity * 100)}%`;
    },
    setExpanded(expanded) {
      element.dataset.expanded = String(expanded);
      palette.hidden = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-label", expanded ? "Collapse Overcode controls" : "Expand Overcode controls");
    },
  };

  for (const meta of MODE_META) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "surface-icon-button";
    button.dataset.tooltip = `${meta.label.toUpperCase()}  ${meta.shortcut}`;
    button.setAttribute("aria-label", `${meta.label} mode, shortcut Control Shift ${meta.shortcut.at(-1)}`);
    button.append(iconElement(meta.icon));
    button.addEventListener("click", () => api.onMode(meta.mode));
    buttons.set(meta.mode, button);
    palette.append(button);
  }

  const opacityControl = document.createElement("label");
  opacityControl.className = "surface-opacity";
  opacityControl.dataset.tooltip = "CHILL OPACITY";
  opacityControl.append(iconElement(opacityIcon));
  const opacityValue = document.createElement("output");
  opacityValue.className = "surface-opacity-value";
  opacityValue.value = "60%";
  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.min = "20";
  opacityInput.max = "90";
  opacityInput.step = "1";
  opacityInput.value = "60";
  opacityInput.setAttribute("aria-label", "Chill mode opacity");
  opacityInput.addEventListener("input", () => {
    const next = Number(opacityInput.value) / 100;
    opacityValue.value = `${opacityInput.value}%`;
    api.onOpacityPreview(next);
  });
  opacityInput.addEventListener("change", () => api.onOpacity(Number(opacityInput.value) / 100));
  opacityControl.append(opacityValue, opacityInput);
  palette.append(opacityControl);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "surface-toggle";
  toggle.dataset.tooltip = "OVERCODE";
  toggle.setAttribute("aria-controls", palette.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Expand Overcode controls");
  const logo = document.createElement("img");
  logo.src = logoDataUrl;
  logo.alt = "";
  logo.draggable = false;
  toggle.append(logo);
  toggle.addEventListener("click", () => api.setExpanded(toggle.getAttribute("aria-expanded") !== "true"));

  element.append(palette, toggle);
  api.setExpanded(false);
  return api;
}

function iconElement(source: string): SVGElement {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
  if (!(parsed instanceof SVGElement)) throw new Error("Phosphor icon did not parse as SVG");
  parsed.setAttribute("aria-hidden", "true");
  parsed.setAttribute("focusable", "false");
  return parsed;
}
