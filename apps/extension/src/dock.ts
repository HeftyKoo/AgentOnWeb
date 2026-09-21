import { createRuntimePicker } from "./runtime-picker.js";
import chillIcon from "@phosphor-icons/core/regular/cloud-sun.svg?raw";
import focusIcon from "@phosphor-icons/core/regular/crosshair-simple.svg?raw";
import watchIcon from "@phosphor-icons/core/regular/eye.svg?raw";
import layersIcon from "@phosphor-icons/core/regular/stack.svg?raw";
import backIcon from "@phosphor-icons/core/regular/arrow-left.svg?raw";
import plusIcon from "@phosphor-icons/core/regular/plus.svg?raw";
import type { AgentOnWebMode } from "@agentonweb/connector-contract";
import type { SurfaceViewState } from "./shared.js";

const MODES = [
  { mode: "chill", label: "Chill", icon: chillIcon },
  { mode: "focus", label: "Focus", icon: focusIcon },
  { mode: "watch", label: "Watch", icon: watchIcon },
] as const;

export interface SurfaceDock {
  readonly element: HTMLElement;
  onDiscover: () => void;
  onRuntime: (runtimeId: string) => void;
  onMode: (mode: AgentOnWebMode) => void;
  onOpacityPreview: (opacity: number) => void;
  onOpacity: (opacity: number) => void;
  focus: () => void;
  render: (state: SurfaceViewState) => void;
  setExpanded: (expanded: boolean) => void;
}

export function createDock(): SurfaceDock {
  const element = document.createElement("nav");
  element.className = "surface-dock";
  element.setAttribute("aria-label", "AgentOnWeb presentation controls");
  const plate = document.createElement("div");
  plate.className = "surface-plate";
  plate.setAttribute("aria-hidden", "true");
  const palette = document.createElement("div");
  palette.className = "surface-palette";
  palette.id = "agentonweb-surface-palette";
  const header = document.createElement("div");
  header.className = "surface-heading";
  const heading = document.createElement("span");
  heading.textContent = "AGENTONWEB";
  const discover = button("Find local workspaces", plusIcon);
  discover.addEventListener("click", () => api.onDiscover());
  const back = button("Back to controls", backIcon);
  back.addEventListener("click", () => { runtimePicker.setOpen(false); runtimePicker.trigger.focus({ preventScroll: true }); });
  header.append(heading, discover, back);
  const controls = document.createElement("div");
  controls.className = "surface-controls";
  const modes = document.createElement("div");
  modes.className = "surface-modes";
  const light = document.createElement("span");
  light.className = "surface-mode-light";
  light.setAttribute("aria-hidden", "true");
  modes.append(light);
  const buttons = MODES.map((meta, index) => {
    const item = button(`${meta.label} mode, shortcut Control Shift ${index + 1}`, meta.icon);
    item.className = "surface-mode";
    item.append(document.createTextNode(meta.label.toUpperCase()));
    item.addEventListener("click", () => { api.onMode(meta.mode); pulse(); });
    modes.append(item);
    return item;
  });
  const opacityControl = document.createElement("label");
  opacityControl.className = "surface-opacity";
  const opacityLabel = document.createElement("span");
  opacityLabel.className = "surface-opacity-label";
  opacityLabel.textContent = "OPACITY";
  const opacityValue = document.createElement("output");
  opacityValue.className = "surface-opacity-value";
  opacityLabel.append(opacityValue);
  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.min = "20";
  opacityInput.max = "90";
  opacityInput.step = "1";
  opacityInput.setAttribute("aria-label", "Chill mode opacity");
  opacityInput.addEventListener("input", () => {
    opacityValue.value = `${opacityInput.value}%`;
    api.onOpacityPreview(Number(opacityInput.value) / 100);
  });
  opacityInput.addEventListener("change", () => { api.onOpacity(Number(opacityInput.value) / 100); pulse(); });
  opacityControl.append(opacityLabel, opacityInput);
  controls.append(modes, opacityControl);
  palette.append(header, controls);
  let expanded = false;
  let workspaceView = false;
  const runtimePicker = createRuntimePicker(id => api.onRuntime(id), open => {
    workspaceView = open;
    // Runtime selection replaces the controls inside the same shell.
    if (open) expanded = true;
    update();
  });
  const toggle = button("Expand AgentOnWeb controls", layersIcon);
  toggle.className = "surface-toggle";
  toggle.setAttribute("aria-controls", palette.id);
  toggle.addEventListener("click", () => api.setExpanded(!expanded));
  const sweep = document.createElement("div");
  sweep.className = "surface-sweep";
  sweep.setAttribute("aria-hidden", "true");
  element.append(plate, palette, runtimePicker.element, toggle, sweep);
  element.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.stopPropagation(); api.setExpanded(false); }
  });
  element.addEventListener("animationend", event => {
    if (event.animationName === "surface-scan") element.classList.remove("is-pulsing");
  });
  function pulse() {
    element.classList.remove("is-pulsing");
    void element.offsetWidth;
    element.classList.add("is-pulsing");
  }
  function update() {
    element.dataset.expanded = String(expanded);
    element.dataset.view = workspaceView ? "workspaces" : "controls";
    palette.inert = !expanded;
    runtimePicker.element.inert = !expanded;
    controls.inert = !expanded || workspaceView;
    heading.textContent = workspaceView ? "WORKSPACES" : "AGENTONWEB";
    back.hidden = !workspaceView;
    discover.hidden = workspaceView;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Collapse AgentOnWeb controls" : "Expand AgentOnWeb controls");
  }
  const api: SurfaceDock = {
    element,
    onDiscover: () => {}, onRuntime: () => {}, onMode: () => {}, onOpacityPreview: () => {}, onOpacity: () => {},
    focus: () => toggle.focus({ preventScroll: true }),
    render(state) {
      runtimePicker.render(state);
      const index = MODES.findIndex(meta => meta.mode === state.mode);
      buttons.forEach((item, i) => item.setAttribute("aria-pressed", String(i === index)));
      light.style.transform = `translateX(calc(${index} * (100% + 6px)))`;
      opacityInput.value = String(Math.round(state.opacity * 100));
      opacityInput.disabled = state.mode !== "chill" || state.runtime?.capabilities.translucency === false;
      opacityControl.dataset.disabled = String(opacityInput.disabled);
      opacityValue.value = `${Math.round(state.opacity * 100)}%`;
      toggle.dataset.unread = String(state.runtimes?.some(runtime => runtime.newOutput) ?? false);
    },
    setExpanded(next) {
      if (!next && element.contains(element.getRootNode() instanceof ShadowRoot
        ? (element.getRootNode() as ShadowRoot).activeElement : document.activeElement)) toggle.focus({ preventScroll: true });
      expanded = next;
      runtimePicker.setOpen(false);
      update();
      if (next) pulse();
    },
  };
  api.setExpanded(false);
  return api;
}

function button(label: string, source: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.innerHTML = source;
  element.querySelector("svg")?.setAttribute("aria-hidden", "true");
  return element;
}
