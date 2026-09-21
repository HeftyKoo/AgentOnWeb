import { OptionTapTracker } from "@agentonweb/connector-contract";
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
  // Page selectors can style the shadow host (for example div { opacity: .8 }).
  // Keep workspace opacity under AgentOnWeb's control, independent of the site.
  host.style.setProperty("opacity", "1", "important");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = styles;
  const root = document.createElement("div");
  root.className = "agentonweb-root";
  const shell = document.createElement("section");
  shell.className = "surface-shell";
  shell.setAttribute("aria-label", "AgentOnWeb native coding workspace");
  let frame = document.createElement("iframe");
  const frames = new Map<string, HTMLIFrameElement>();
  const unread = new Set<string>();
  const readyFrames = new WeakSet<HTMLIFrameElement>();
  frame.hidden = true;
  frame.className = "runtime-frame";
  frame.title = "Native coding workspace";
  frame.allow = "clipboard-read; clipboard-write";
  const setup = createSetup();
  const dock = createDock();
  const passLabel = document.createElement("div");
  passLabel.className = "site-pass-label";
  passLabel.textContent = "WEBSITE  ⌥⌥";
  // Keep the placeholder detached: mounting about:blank inherits the site's
  // CSP and can duplicate its parser warnings before a workspace is opened.
  shell.append(setup.element, dock.element, passLabel);
  root.append(shell);
  shadow.append(style, root);
  document.documentElement.append(host);

  let state: SurfaceViewState = {
    mode: "chill",
    connection: "disconnected",
    opacity: DEFAULT_SURFACE_OPACITY,
  };
  let surfaceOrigin: string | undefined;
  let frameNonce: string | undefined;
  let sitePassActive = false;
  // Restore the shared dismissal preference on first state delivery. Later
  // broadcasts never reopen a page; the dock remains its explicit entry point.
  let visible = false;
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
  dock.onDiscover = () => send({ source: "agentonweb-content", type: "runtime.connect" });
  dock.onRuntime = (runtimeId) => {
    setVisible(true);
    send({ source: "agentonweb-content", type: "runtime.activate", runtimeId });
  };
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
    if (!readyFrames.has(frame) || !frame.contentWindow || !frameNonce || !surfaceOrigin) return;
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
  const render = (next: SurfaceViewState) => {
    state = next;
    for (const [id, saved] of frames) {
      saved.hidden = true;
      if (state.surfaces && !state.surfaces.some(item => item.runtimeId === id)) { saved.remove(); frames.delete(id); }
    }
    host.dataset.mode = state.mode;
    root.dataset.mode = state.mode;
    host.style.setProperty("--agentonweb-surface-opacity", String(state.opacity));
    if (state.mode !== "chill" && sitePassActive) {
      setSitePass(false);
      optionLatch.reset();
    }
    if (visible && state.mode !== "watch" && state.surface) unread.delete(state.surface.runtimeId);
    dock.render({ ...state, runtimes: (state.runtimes ?? []).map(item => ({ ...item, newOutput: unread.has(item.id) })) });
    setup.render(state, visible);
    root.dataset.active = String(visible);
    root.dataset.hasSurface = String(Boolean(state.surface));
    // Discovery identifies other runtimes' management pages before pairing.
    // Never cover them with the selected runtime or recursively embed a runtime.
    if (state.nativeOrigins?.includes(location.origin)
      || [state.nativeUrl, state.approvalUrl, state.surface?.url, ...(state.surfaces ?? []).map(item => item.url)].some((url) => url && location.origin === new URL(url).origin)) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (!state.surface) {
      frame.hidden = true;

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
    const existingFrame = frames.get(state.surface.runtimeId);
    if (existingFrame) frame = existingFrame;
    else {
      if (frames.size > 0 || frame.src) frame = document.createElement("iframe");
      frame.className = "runtime-frame";
      frame.allow = "clipboard-read; clipboard-write";
      frames.set(state.surface.runtimeId, frame);
    }
    const nextNonce = state.surface.frameName.replace(/^agentonweb:/u, "");
    const runtime = browser.runtime as typeof browser.runtime & { getURL(path: string): string };
    const nextSource = new URL(runtime.getURL("/native-surface.html"));
    nextSource.hash = new URLSearchParams({ url: state.surface.url, nonce: nextNonce, parent: location.origin }).toString();
    const sourceChanged = frame.src !== nextSource.href || frame.name !== state.surface.frameName;
    surfaceOrigin = `${nextSource.protocol}//${nextSource.host}`;
    frameNonce = nextNonce;
    frame.title = state.surface.displayName;
    if (sourceChanged) {
      readyFrames.delete(frame);
      frame.name = state.surface.frameName;
      frame.src = nextSource.href;
    }
    // Set the authorized URL before mounting, and never reinsert a retained
    // iframe: reinsertion destroys its browsing context in some browsers.
    if (!frame.isConnected) shell.prepend(frame);
    // Explicitly hide the frame in Watch. Safari can keep painting descendants
    // of a cross-process extension frame when only CSS visibility is hidden.
    frame.hidden = state.mode === "watch";
    // A load event can describe about:blank or a blocked error document.
    // Only the wrapper's origin/source/nonce-checked handshake proves readiness.
    if (!sourceChanged) postPresentation();
  };

  const setVisible = (next: boolean) => {
    receivedUpdate = true;
    send({ source: "agentonweb-content", type: "visibility.set", visible: next });
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
      if (!receivedUpdate) visible = message.state.dismissed !== true;
      receivedUpdate = true;
      render(message.state);
    }
    if (isSurfaceCommand(message)) {
      receivedUpdate = true;
      state = message.state;
      const next = message.type === "surface.toggle" ? !visible : true;
      setVisible(next);
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
    const message = event.data as { source?: unknown; type?: unknown; nonce?: unknown } | null;
    if (!message || message.source !== "agentonweb-surface") return;
    if (message.type === "surface.output" || message.type === "surface.wrapper-ready") {
      const entry = [...frames].find(([, saved]) => saved.contentWindow === event.source);
      if (!entry || !entry[1].src) return;
      const expected = new URL(entry[1].src);
      if (event.origin !== `${expected.protocol}//${expected.host}` || message.nonce !== entry[1].name.replace(/^agentonweb:/u, "")) return;
      if (message.type === "surface.wrapper-ready") {
        readyFrames.add(entry[1]);
        if (entry[1] === frame) postPresentation();
        return;
      }
      if (!visible || state.mode === "watch" || state.surface?.runtimeId !== entry[0]) {
        unread.add(entry[0]);
        dock.render({ ...state, runtimes: (state.runtimes ?? []).map(item => ({ ...item, newOutput: unread.has(item.id) })) });
      }
      return;
    }
    if (!frame.contentWindow || event.source !== frame.contentWindow || event.origin !== surfaceOrigin) return;
    if (message.type !== "site-pass.option-tap") return;
    if (message.nonce !== frameNonce) return;
    if (state.runtime?.capabilities.optionTap !== false) handleOptionTap();
  });

  const optionTap = new OptionTapTracker();
  window.addEventListener("keydown", event => optionTap.keydown(event), true);
  window.addEventListener("keyup", event => {
    if (optionTap.keyup(event)) handleOptionTap();
  }, true);
  window.addEventListener("blur", () => optionTap.reset());

  browser.runtime.sendMessage({ source: "agentonweb-content", type: "state.get" } satisfies ContentRequest)
    .then((response: { ok?: boolean; result?: SurfaceViewState } | undefined) => {
      // A slow initial snapshot must not overwrite a newer explicit open/update.
      if (response?.result && !receivedUpdate) {
        visible = response.result.dismissed !== true;
        receivedUpdate = true;
        render(response.result);
      }
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
  title.textContent = "AgentOnWeb · Local workspaces";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "surface-setup-close";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close AgentOnWeb");
  header.append(title, close);
  const copy = document.createElement("p");
  copy.textContent = "Choose Local terminal to use your shell, or connect DSH. First-time setup: install the local service with aow service install, then approve this browser in its setup page.";
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
