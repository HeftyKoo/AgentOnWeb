import { createDock } from "./dock.js";
import { DEFAULT_SURFACE_OPACITY, DoubleTapLatch } from "./interaction.js";
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
  shell.setAttribute("aria-label", "Overcode native coding workspace");
  const frame = document.createElement("iframe");
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
    mode: "chill",
    connection: "disconnected",
    paired: false,
    endpoint: "",
    opacity: DEFAULT_SURFACE_OPACITY,
  };
  let surfaceOrigin: string | undefined;
  let frameNonce: string | undefined;
  let sitePassActive = false;
  const optionLatch = new DoubleTapLatch();

  const send = (request: ContentRequest) => {
    void chrome.runtime.sendMessage(request).catch(() => undefined);
  };

  setup.onConnect = (runtimeId) => {
    send({ source: "overcode-content", type: "runtime.connect", ...(runtimeId ? { runtimeId } : {}) });
  };
  setup.onApproval = () => send({ source: "overcode-content", type: "runtime.approval" });
  dock.onMode = (mode) => {
    setSitePass(false);
    optionLatch.reset();
    send({ source: "overcode-content", type: "mode.set", mode });
  };
  dock.onOpacity = (opacity) => {
    host.style.setProperty("--overcode-surface-opacity", String(opacity));
    postOpacity(opacity);
    send({ source: "overcode-content", type: "opacity.set", opacity });
  };
  dock.onOpacityPreview = (opacity) => {
    host.style.setProperty("--overcode-surface-opacity", String(opacity));
    postOpacity(opacity);
  };

  const postToSurface = (message: Record<string, unknown>) => {
    if (!frame.contentWindow || !frameNonce || !surfaceOrigin) return;
    frame.contentWindow.postMessage({
      source: "overcode-extension",
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
    host.style.setProperty("--overcode-surface-opacity", String(state.opacity));
    if (state.mode !== "chill" && sitePassActive) {
      setSitePass(false);
      optionLatch.reset();
    }
    dock.render(state);
    setup.render(state);
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
    frame.title = state.surface.displayName;
    if (sourceChanged) {
      frame.name = state.surface.frameName;
      frame.src = nextSource.href;
    }
    frame.hidden = false;
    postPresentation();
  };

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isStateUpdate(message)) render(message.state);
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
    if (state.mode !== "chill") {
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
    if (!message || message.source !== "overcode-surface" || message.type !== "site-pass.option-tap") return;
    if (message.nonce !== frameNonce) return;
    if (state.runtime?.capabilities.optionTap !== false) handleOptionTap();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Alt" && !event.repeat) handleOptionTap();
  }, true);

  void chrome.runtime.sendMessage({ source: "overcode-content", type: "state.get" } satisfies ContentRequest)
    .then((response: { ok?: boolean; result?: SurfaceViewState } | undefined) => {
      if (response?.result) render(response.result);
    });
}

function createSetup(): {
  element: HTMLElement;
  onConnect: (runtimeId?: string) => void;
  onApproval: () => void;
  render: (state: SurfaceViewState) => void;
} {
  const element = document.createElement("div");
  element.className = "surface-setup";
  const title = document.createElement("strong");
  title.textContent = "Your coding agent, everywhere.";
  const copy = document.createElement("p");
  copy.textContent = "Start your coding runtime with its Overcode plugin. Approve this browser once in the native workspace.";
  const form = document.createElement("form");
  const runtimes = document.createElement("select");
  runtimes.setAttribute("aria-label", "Coding runtime");
  runtimes.hidden = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Connect";
  const status = document.createElement("small");
  form.append(runtimes, submit);
  element.append(title, copy, form, status);
  const api = {
    element,
    onConnect: (_runtimeId?: string) => {},
    onApproval: () => {},
    render(state: SurfaceViewState) {
      element.hidden = Boolean(state.surface);
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
      status.textContent = state.error ?? (state.connection === "awaiting-approval" ? "Waiting for your approval in the native workspace…" : state.paired ? "Reconnecting to your native workspace…" : "No pairing code or API key needed.");
    },
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (form.dataset.pending === "true") api.onApproval();
    else api.onConnect(runtimes.value || undefined);
  });
  return api;
}
