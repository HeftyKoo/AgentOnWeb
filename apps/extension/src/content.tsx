import { createDock } from "./dock.js";
import { browser } from "./browser-api.js";
import { DEFAULT_SURFACE_OPACITY, DoubleTapLatch } from "./interaction.js";
import styles from "./overlay.css?inline";
import { isStateUpdate, isSurfaceCommand, type ContentRequest, type SurfaceViewState } from "./shared.js";

const HOST_ID = "agentonweb-extension-root";

if (!document.getElementById(HOST_ID)) {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.hidden = true;
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;isolation:isolate;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = styles;
  const root = document.createElement("div");
  root.className = "agentonweb-root";
  const shell = document.createElement("section");
  shell.className = "surface-shell";
  shell.setAttribute("aria-label", "AgentOnWeb native coding workspace");
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.className = "runtime-frame";
  frame.title = "Native coding workspace";
  frame.allow = "clipboard-read; clipboard-write";
  const setup = createSetup();
  const dock = createDock();
  const passLabel = document.createElement("div");
  passLabel.className = "site-pass-label";
  passLabel.textContent = "WEBSITE  ⌥⌥";
  shell.append(frame, setup.element, dock.element, passLabel);
  root.append(shell);
  shadow.append(style, root);
  document.documentElement.append(host);

  let state: SurfaceViewState = {
    mode: "watch",
    connection: "disconnected",
    opacity: DEFAULT_SURFACE_OPACITY,
  };
  let surfaceOrigin: string | undefined;
  let frameNonce: string | undefined;
  let sitePassActive = false;
  // Each page starts open. Closing deactivates the panel/workspace while the
  // lower-right dock remains available as the in-page re-entry point.
  let visible = true;
  let receivedUpdate = false;
  let previousFocus = document.activeElement instanceof HTMLElement && document.activeElement !== host
    ? document.activeElement : undefined;
  const optionLatch = new DoubleTapLatch();

  const send = (request: ContentRequest) => {
    browser.runtime.sendMessage(request).catch(() => undefined);
  };

  setup.onConnect = (runtimeId) => {
    send({ source: "agentonweb-content", type: "runtime.connect", ...(runtimeId ? { runtimeId } : {}) });
  };
  setup.onApproval = () => send({ source: "agentonweb-content", type: "runtime.approval" });
  setup.onClose = () => setVisible(false);
  dock.onMode = (mode) => {
    setSitePass(false);
    optionLatch.reset();
    setVisible(true);
    send({ source: "agentonweb-content", type: "mode.set", mode });
  };
  dock.onOpacity = (opacity) => {
    host.style.setProperty("--agentonweb-surface-opacity", String(opacity));
    postOpacity(opacity);
    send({ source: "agentonweb-content", type: "opacity.set", opacity });
  };
  dock.onOpacityPreview = (opacity) => {
    host.style.setProperty("--agentonweb-surface-opacity", String(opacity));
    postOpacity(opacity);
  };

  const postToSurface = (message: Record<string, unknown>) => {
    if (!frame.contentWindow || !frameNonce || !surfaceOrigin) return;
    frame.contentWindow.postMessage({
      source: "agentonweb-extension",
      nonce: frameNonce,
      ...message,
    }, surfaceOrigin);
  };
  const postMode = () => postToSurface({ type: "mode.set", mode: state.mode });
  const postOpacity = (opacity: number) => {
    if (state.runtime?.capabilities.translucency !== false) postToSurface({ type: "opacity.set", opacity });
  };
  const postPresentation = () => {
    postMode();
    postOpacity(state.opacity);
  };
  frame.addEventListener("load", postPresentation);

  const render = (next: SurfaceViewState) => {
    state = next;
    host.dataset.mode = state.mode;
    root.dataset.mode = state.mode;
    host.style.setProperty("--agentonweb-surface-opacity", String(state.opacity));
    if (state.mode !== "chill" && sitePassActive) {
      setSitePass(false);
      optionLatch.reset();
    }
    dock.render(state);
    setup.render(state, visible);
    root.dataset.active = String(visible);
    root.dataset.hasSurface = String(Boolean(state.surface));
    // Keep the native authorization tab usable before pairing; never overlay
    // its approval UI or recursively embed a runtime into itself.
    if ([state.nativeUrl, state.approvalUrl, state.surface?.url].some((url) => url && location.origin === new URL(url).origin)) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (!state.surface) {
      frame.hidden = true;
      frame.removeAttribute("src");
      surfaceOrigin = undefined;
      frameNonce = undefined;
      return;
    }
    // Once mounted, closing leaves the frame and native task untouched. A
    // workspace discovered while closed waits for an explicit mode/open action.
    if (!visible) {
      frame.hidden = true;
      return;
    }
    const nextNonce = state.surface.frameName.replace(/^agentonweb:/u, "");
    const nextSource = new URL(state.surface.url);
    nextSource.hash = new URLSearchParams({ agentonweb: nextNonce }).toString();
    const sourceChanged = frame.src !== nextSource.href || frame.name !== state.surface.frameName;
    surfaceOrigin = new URL(state.surface.url).origin;
    frameNonce = nextNonce;
    frame.title = state.surface.displayName;
    if (sourceChanged) {
      frame.name = state.surface.frameName;
      frame.src = nextSource.href;
    }
    frame.hidden = false;
    // Before the navigation loads, contentWindow still has the website's
    // origin. Posting the localhost presentation target at that moment makes
    // the browser record a misleading origin-mismatch extension error.
    if (!sourceChanged) postPresentation();
  };

  const setVisible = (next: boolean) => {
    if (next === visible) {
      render(state);
      if (next && !state.surface) setup.element.focus({ preventScroll: true });
      return;
    }
    if (next && document.activeElement instanceof HTMLElement && document.activeElement !== host) {
      previousFocus = document.activeElement;
    }
    const hadFocus = document.activeElement === host;
    visible = next;
    setSitePass(false);
    optionLatch.reset();
    dock.setExpanded(false);
    render(state);
    if (!next) {
      if (hadFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      previousFocus = undefined;
    } else if (!host.hidden) {
      if (!state.surface) setup.element.focus({ preventScroll: true });
      else if (state.mode === "watch") dock.focus();
      else frame.focus({ preventScroll: true });
    }
  };

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isStateUpdate(message)) {
      receivedUpdate = true;
      render(message.state);
    }
    if (isSurfaceCommand(message)) {
      receivedUpdate = true;
      state = message.state;
      const next = message.type === "surface.toggle" ? !visible : true;
      if (next === visible) render(state);
      else setVisible(next);
    }
  });

  // Escape belongs to our own controls only. Do not consume Escape in the
  // website or the native iframe, where it may dismiss a menu or cancel input.
  shell.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    setVisible(false);
  });

  const setSitePass = (active: boolean) => {
    sitePassActive = active && state.mode === "chill";
    if (sitePassActive) {
      host.dataset.sitePass = "true";
      root.dataset.sitePass = "true";
    } else {
      delete host.dataset.sitePass;
      delete root.dataset.sitePass;
    }
  };
  const handleOptionTap = () => {
    if (!visible || host.hidden || !state.surface || state.mode !== "chill") {
      setSitePass(false);
      optionLatch.reset();
      return;
    }
    const next = optionLatch.tap(performance.now());
    if (next !== undefined) setSitePass(next);
  };

  window.addEventListener("message", (event) => {
    if (!frame.contentWindow || event.source !== frame.contentWindow || event.origin !== surfaceOrigin) return;
    const message = event.data as { source?: unknown; type?: unknown; nonce?: unknown } | null;
    if (!message || message.source !== "agentonweb-surface" || message.type !== "site-pass.option-tap") return;
    if (message.nonce !== frameNonce) return;
    if (state.runtime?.capabilities.optionTap !== false) handleOptionTap();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Alt" && !event.repeat) handleOptionTap();
  }, true);

  browser.runtime.sendMessage({ source: "agentonweb-content", type: "state.get" } satisfies ContentRequest)
    .then((response: { ok?: boolean; result?: SurfaceViewState } | undefined) => {
      // A slow initial snapshot must not overwrite a newer explicit open/update.
      if (response?.result && !receivedUpdate) render(response.result);
    }).catch(() => render(state));
}

function createSetup(): {
  element: HTMLElement;
  onConnect: (runtimeId?: string) => void;
  onApproval: () => void;
  onClose: () => void;
  render: (state: SurfaceViewState, active: boolean) => void;
} {
  const element = document.createElement("div");
  element.className = "surface-setup";
  element.tabIndex = -1;
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-labelledby", "agentonweb-setup-title");
  const header = document.createElement("div");
  header.className = "surface-setup-header";
  const title = document.createElement("strong");
  title.id = "agentonweb-setup-title";
  title.textContent = "AgentOnWeb · DSH On Web";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "surface-setup-close";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close AgentOnWeb");
  header.append(title, close);
  const copy = document.createElement("p");
  copy.textContent = "Bring DeepSeek Harness onto this page. Start dsh web with the AgentOnWeb plugin, then approve this browser in the native workspace.";
  const form = document.createElement("form");
  const runtimes = document.createElement("select");
  runtimes.setAttribute("aria-label", "Coding runtime");
  runtimes.hidden = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Connect";
  const status = document.createElement("small");
  status.setAttribute("role", "status");
  const hint = document.createElement("p");
  hint.className = "surface-setup-hint";
  hint.textContent = "Open again from the AgentOnWeb toolbar icon or your extension shortcut. Esc closes this panel.";
  form.append(runtimes, submit);
  element.append(header, copy, form, status, hint);
  const api = {
    element,
    onConnect: (_runtimeId?: string) => {},
    onApproval: () => {},
    onClose: () => {},
    render(state: SurfaceViewState, active: boolean) {
      element.hidden = Boolean(state.surface) || !active;
      const list = state.runtimes ?? [];
      const selected = runtimes.value;
      runtimes.replaceChildren(...list.map((runtime) => {
        const option = document.createElement("option");
        option.value = runtime.id; option.textContent = runtime.displayName;
        return option;
      }));
      runtimes.hidden = list.length < 2;
      if (selected) runtimes.value = selected;
      form.dataset.pending = String(state.connection === "awaiting-approval");
      submit.disabled = state.connection === "connecting";
      submit.textContent = state.connection === "awaiting-approval" ? "Open workspace to approve" : state.connection === "connecting" ? "Finding runtime…" : "Connect";
      status.dataset.error = String(Boolean(state.error));
      status.textContent = state.error ?? (state.connection === "awaiting-approval" ? "Waiting for your approval in the native workspace…" : state.connection === "reconnecting" ? "Reconnecting in the background. You can close this panel." : state.connection === "connecting" ? "Looking for your native workspace…" : state.connection === "connected" ? "Loading your native workspace…" : "Not connected. Connect when you're ready.");
    },
  };
  close.addEventListener("click", () => api.onClose());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (form.dataset.pending === "true") api.onApproval();
    else api.onConnect(runtimes.value || undefined);
  });
  return api;
}
