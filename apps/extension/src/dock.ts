import { surfaceShortcut, isMacPlatform, type SurfaceShortcut } from "@agentonweb/connector-contract";
import { createAgentActivity } from "./agent-activity.js";
import type { AgentSession } from "@agentonweb/connector-contract";
import { nextRuntimeId } from "./runtime-navigation.js";
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
  onSession: (session: AgentSession) => void;
  onAttentionRead: (id: string) => void;
  onDiscover: () => void;
  onRuntime: (runtimeId: string) => void;
  onMode: (mode: AgentOnWebMode) => void;
  onOpacityPreview: (opacity: number) => void;
  onOpacity: (opacity: number) => void;
  shortcut: (action: SurfaceShortcut) => void;
  focus: () => void;
  render: (state: SurfaceViewState) => void;
  setExpanded: (expanded: boolean) => void;
}

export function createDock(options: {
  localModeShortcuts?: boolean;
  runtimeShortcutEnabled?: () => boolean;
} = {}): SurfaceDock {
  const mac = isMacPlatform();
  const modifier = mac ? "⌃" : "Alt+";
  const modifierName = mac ? "Control" : "Alt";
  let runtimeIds: string[] = [];
  let sessionsView = false;
  let hasSessions = false;
  let currentRuntimeId: string | undefined;
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
  back.addEventListener("click", () => { sessionsView = false; runtimePicker.setOpen(false); runtimePicker.trigger.focus({ preventScroll: true }); });
  const activity = createAgentActivity(session => api.onSession(session), id => api.onAttentionRead(id));
  const sessionsButton = button("Show agent sessions", layersIcon);
  sessionsButton.addEventListener("click", () => { sessionsView = !sessionsView; runtimePicker.setOpen(false); update(); });
  header.append(heading, sessionsButton, discover, back);
  const controls = document.createElement("div");
  controls.className = "surface-controls";
  const modes = document.createElement("div");
  modes.className = "surface-modes";
  const light = document.createElement("span");
  light.className = "surface-mode-light";
  light.setAttribute("aria-hidden", "true");
  modes.append(light);
  const buttons = MODES.map((meta, index) => {
    const item = button(`${meta.label} mode, shortcut ${modifierName} ${index + 1}`, meta.icon);
    item.className = "surface-mode";
    item.append(document.createTextNode(meta.label.toUpperCase()));
    const hint = document.createElement("kbd");
    hint.textContent = `${modifier}${index + 1}`;
    item.append(hint);
    item.setAttribute("aria-keyshortcuts", `${modifierName}+${index + 1}`);
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
  palette.append(header, controls, activity.element);
  let expanded = false;
  let workspaceView = false;
  const runtimePicker = createRuntimePicker(id => api.onRuntime(id), open => {
    workspaceView = open;
    if (open) sessionsView = false;
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
  const badge = document.createElement("span"); badge.className = "agent-count"; badge.hidden = true; toggle.append(badge);
  element.append(plate, palette, runtimePicker.element, toggle, sweep, activity.toast);
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
    element.dataset.view = workspaceView ? "workspaces" : sessionsView ? "sessions" : "controls";
    palette.inert = !expanded;
    runtimePicker.element.inert = !expanded;
    controls.inert = !expanded || workspaceView || sessionsView;
    activity.element.hidden = !sessionsView || workspaceView;
    activity.element.inert = !expanded;
    sessionsButton.setAttribute("aria-pressed", String(sessionsView));
    heading.textContent = workspaceView ? "WORKSPACES" : sessionsView ? "SESSIONS" : "AGENTONWEB";
    back.hidden = !workspaceView && !sessionsView;
    discover.hidden = workspaceView;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Collapse AgentOnWeb controls" : "Expand AgentOnWeb controls");
  }
  const api: SurfaceDock = {
    element,
    onSession: () => {}, onAttentionRead: () => {}, onDiscover: () => {}, onRuntime: () => {}, onMode: () => {}, onOpacityPreview: () => {}, onOpacity: () => {},
    shortcut(action) {
      if (action !== "runtime.toggle") { api.onMode(action); return; }
      const nextId = nextRuntimeId(runtimeIds.map(id => ({ id })), currentRuntimeId);
      if (nextId) api.onRuntime(nextId);
      else { api.setExpanded(true); runtimePicker.setOpen(true); api.onDiscover(); }
    },
    focus: () => toggle.focus({ preventScroll: true }),
    render(state) {
      const activityState = activity.render(state.agentSessions ?? [], state.readAttentionIds);
      hasSessions = activityState.hasSessions;
      badge.hidden = !activityState.count;
      badge.textContent = String(activityState.count);
      toggle.dataset.approval = String(activityState.approval);
      currentRuntimeId = state.runtimeId;
      runtimeIds = (state.runtimes ?? []).map(runtime => runtime.id);
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
      sessionsView = next && hasSessions;
      runtimePicker.setOpen(false);
      update();
      if (next) pulse();
    },
  };
  // Listen inside the closed shadow root: document-level paths hide its children.
  let insidePointer = false;
  element.addEventListener("pointerdown", () => { insidePointer = true; });
  document.addEventListener("pointerdown", () => {
    if (element.isConnected && expanded && !insidePointer) api.setExpanded(false);
    insidePointer = false;
  });
  window.addEventListener("blur", () => {
    setTimeout(() => {
      const root = element.getRootNode() as Document | ShadowRoot;
      if (element.isConnected && root.activeElement?.tagName === "IFRAME") api.setExpanded(false);
    }, 0);
  });
  window.addEventListener("keydown", event => {
    const root = element.getRootNode();
    if (!element.isConnected || (root instanceof ShadowRoot && (root.host as HTMLElement).hidden)) return;
    const action = surfaceShortcut(event);
    if (action === undefined || event.defaultPrevented) return;
    // Production mode keys belong exclusively to browser.commands, including
    // user remaps. Only the standalone preview/demo need a local fallback.
    if (action !== "runtime.toggle" && !options.localModeShortcuts) return;
    if (action === "runtime.toggle" && !expanded && !options.runtimeShortcutEnabled?.()) return;
    // Keep website editors' own shortcuts intact. Native workspace iframes
    // forward the one explicitly reserved runtime switch separately.
    if (event.composedPath().some(target => target instanceof HTMLElement &&
      (target.matches("input, textarea, select, [role=textbox]") || target.isContentEditable))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) api.shortcut(action);
  }, true);
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
