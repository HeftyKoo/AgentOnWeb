import { DEFAULT_BRIDGE_ENDPOINT, type OvercodeMode } from "@overcode/shared-protocol";
import styles from "./overlay.css";
import { isStateUpdate, type ContentRequest, type SurfaceViewState } from "./shared.js";

const HOST_ID = "overcode-extension-root";

if (!document.getElementById(HOST_ID)) {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;isolation:isolate;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = styles;
  const root = document.createElement("div");
  root.className = "overcode-root";
  const shell = document.createElement("section");
  shell.className = "surface-shell";
  shell.setAttribute("aria-label", "Overcode DeepSeek Harness surface");
  const frame = document.createElement("iframe");
  frame.className = "harness-frame";
  frame.title = "DeepSeek Harness";
  frame.allow = "clipboard-read; clipboard-write";
  const setup = createSetup();
  const dock = createDock();
  const passLabel = document.createElement("div");
  passLabel.className = "site-pass-label";
  passLabel.textContent = "WEBSITE ACTIVE — RELEASE ⌥ TO RETURN";
  shell.append(frame, setup.element, dock.element, passLabel);
  root.append(shell);
  shadow.append(style, root);
  document.documentElement.append(host);

  let state: SurfaceViewState = {
    mode: "chill",
    connection: "disconnected",
    paired: false,
    endpoint: DEFAULT_BRIDGE_ENDPOINT,
  };
  let surfaceOrigin: string | undefined;
  let frameNonce: string | undefined;

  const send = (request: ContentRequest) => {
    void chrome.runtime.sendMessage(request).catch(() => undefined);
  };

  setup.onPair = (endpoint, pairingCode) => {
    send({ source: "overcode-content", type: "bridge.pair", endpoint, pairingCode });
  };
  dock.onMode = (mode) => send({ source: "overcode-content", type: "mode.set", mode });

  const postMode = () => {
    if (!frame.contentWindow || !frameNonce || !surfaceOrigin) return;
    frame.contentWindow.postMessage({
      source: "overcode-extension",
      type: "mode.set",
      nonce: frameNonce,
      mode: state.mode,
    }, surfaceOrigin);
  };
  frame.addEventListener("load", postMode);

  const render = (next: SurfaceViewState) => {
    state = next;
    host.dataset.mode = state.mode;
    dock.render(state);
    setup.render(state);
    if (!state.surface) {
      frame.hidden = true;
      return;
    }
    if (location.origin === new URL(state.surface.url).origin) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const nextNonce = state.surface.frameName.replace(/^overcode:/u, "");
    const nextSource = new URL(state.surface.url);
    nextSource.hash = new URLSearchParams({ overcode: nextNonce }).toString();
    const sourceChanged = frame.src !== nextSource.href || frame.name !== state.surface.frameName;
    surfaceOrigin = new URL(state.surface.url).origin;
    frameNonce = nextNonce;
    if (sourceChanged) {
      frame.name = state.surface.frameName;
      frame.src = nextSource.href;
    }
    frame.hidden = false;
    postMode();
  };

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isStateUpdate(message)) render(message.state);
  });

  window.addEventListener("message", (event) => {
    if (!frame.contentWindow || event.source !== frame.contentWindow || event.origin !== surfaceOrigin) return;
    const message = event.data as { source?: unknown; type?: unknown; nonce?: unknown; active?: unknown } | null;
    if (!message || message.source !== "overcode-harness" || message.type !== "site-pass") return;
    if (message.nonce !== frameNonce || typeof message.active !== "boolean") return;
    setSitePass(message.active);
  });

  const setSitePass = (active: boolean) => {
    if (active && state.mode === "chill") host.dataset.sitePass = "true";
    else delete host.dataset.sitePass;
  };
  window.addEventListener("keydown", (event) => {
    if (event.key === "Alt") setSitePass(true);
  }, true);
  window.addEventListener("keyup", (event) => {
    if (event.key === "Alt") setSitePass(false);
  }, true);
  window.addEventListener("blur", () => setSitePass(false));

  void chrome.runtime.sendMessage({ source: "overcode-content", type: "state.get" } satisfies ContentRequest)
    .then((response: { ok?: boolean; result?: SurfaceViewState } | undefined) => {
      if (response?.result) render(response.result);
    });
}

function createDock(): {
  element: HTMLElement;
  onMode: (mode: OvercodeMode) => void;
  render: (state: SurfaceViewState) => void;
} {
  const element = document.createElement("nav");
  element.className = "surface-dock";
  element.setAttribute("aria-label", "Overcode mode");
  const brand = document.createElement("span");
  brand.className = "surface-brand";
  brand.textContent = "OVERCODE";
  const runtime = document.createElement("span");
  runtime.className = "surface-runtime";
  const buttons = new Map<OvercodeMode, HTMLButtonElement>();
  const api = {
    element,
    onMode: (_mode: OvercodeMode) => {},
    render(state: SurfaceViewState) {
      runtime.textContent = state.surface?.displayName ?? state.connection;
      for (const [mode, button] of buttons) button.setAttribute("aria-pressed", String(state.mode === mode));
    },
  };
  element.append(brand, runtime);
  for (const mode of ["chill", "focus", "watch"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = mode;
    button.addEventListener("click", () => api.onMode(mode));
    buttons.set(mode, button);
    element.append(button);
  }
  const hint = document.createElement("span");
  hint.className = "surface-hint";
  hint.textContent = "HOLD ⌥ FOR WEBSITE";
  element.append(hint);
  return api;
}

function createSetup(): {
  element: HTMLElement;
  onPair: (endpoint: string, pairingCode: string) => void;
  render: (state: SurfaceViewState) => void;
} {
  const element = document.createElement("div");
  element.className = "surface-setup";
  const title = document.createElement("strong");
  title.textContent = "Connect DeepSeek Harness";
  const copy = document.createElement("p");
  copy.textContent = "Overcode presents the native Harness workspace. It does not replace its sessions, tools, approvals, or plugins.";
  const form = document.createElement("form");
  const endpoint = document.createElement("input");
  endpoint.value = DEFAULT_BRIDGE_ENDPOINT;
  endpoint.setAttribute("aria-label", "Bridge endpoint");
  const code = document.createElement("input");
  code.placeholder = "Pairing code";
  code.autocomplete = "off";
  code.setAttribute("aria-label", "Pairing code");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Connect";
  const status = document.createElement("small");
  form.append(endpoint, code, submit);
  element.append(title, copy, form, status);
  const api = {
    element,
    onPair: (_endpoint: string, _pairingCode: string) => {},
    render(state: SurfaceViewState) {
      endpoint.value = state.endpoint;
      element.hidden = Boolean(state.surface);
      status.textContent = state.error ?? (state.paired ? "Starting the native Harness workspace…" : "Enter the one-time Bridge pairing code.");
    },
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (endpoint.value.trim() && code.value.trim()) api.onPair(endpoint.value.trim(), code.value.trim());
  });
  return api;
}
