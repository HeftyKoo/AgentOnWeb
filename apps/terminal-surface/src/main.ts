import { OptionTapTracker } from "@agentonweb/connector-contract";
import { Terminal } from "@xterm/xterm";
import { splitInput } from "./input.js";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
// The single-use setup URL serves this document directly; discard its token
// from browser history once the first-party page has committed.
if (location.pathname === "/launch") window.history.replaceState(null, "", "/");
const terminal = new Terminal({
  allowTransparency: true,
  fontFamily: "Menlo, Consolas, monospace",
  fontSize: 14,
  scrollback: 3000,
  theme: { background: "#15171cff", foreground: "#f1f3f5" },
});
const fit = new FitAddon();
terminal.loadAddon(fit);
const container = document.querySelector<HTMLElement>("#terminal")!;
const status = document.querySelector<HTMLElement>("#status")!;
const notice = document.querySelector<HTMLElement>("#connection-notice")!;

function showStatus(message: string) {
  if (status.textContent !== message) status.textContent = message;
  if (notice.textContent !== message) notice.textContent = message;
  notice.hidden = message === "Connected";
}
terminal.open(container);
const sessionPicker = document.querySelector<HTMLElement>("#sessions")!;
const newButton = document.querySelector<HTMLButtonElement>("#new")!;
type ConnectionState = "background" | "connecting" | "connected" | "disconnected" | "exited";
const sessionStates = new Map<string, ConnectionState>();
function updateTabs() {
  for (const tab of sessionPicker.querySelectorAll<HTMLElement>(".terminal-tab")) {
    const id = tab.dataset.session!;
    tab.dataset.selected = String(id === sessionId);
    tab.querySelector(".tab-select")!.setAttribute("aria-pressed", String(id === sessionId));
    const state = sessionStates.get(id) ?? "background";
    tab.dataset.state = state;
    const label = state === "background" ? "In local host" : state === "connecting" ? "Connecting…" : state === "exited" ? "Process exited" : state === "connected" ? "Connected" : "Disconnected";
    const dot = tab.querySelector<HTMLElement>(".status-dot")!;
    dot.setAttribute("aria-label", label);
    dot.title = label;
    const reconnect = tab.querySelector<HTMLButtonElement>(".tab-reconnect")!;
    reconnect.hidden = state !== "disconnected" && state !== "connecting";
    reconnect.disabled = state !== "disconnected";
    reconnect.title = state === "connecting" ? "Connecting…" : "Reconnect";
    reconnect.setAttribute("aria-label", `${reconnect.title} ${tab.dataset.name}`);
  }
}
function setConnectionState(state: ConnectionState) {
  if (sessionId) sessionStates.set(sessionId, state);
  updateTabs();
}
let sessionId = sessionStorage.getItem("agentonweb-terminal") || "";
const apiHeaders = {
  "X-AgentOnWeb-Terminal": "1",
  "Content-Type": "application/json",
};
async function api(path: string, action?: object) {
  const response = await fetch(path, {
    headers: apiHeaders,
    ...(action ? { method: "POST", body: JSON.stringify(action) } : {}),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : response.status === 403
          ? "Connect through AgentOnWeb or open the private setup link."
          : "Terminal host request failed.";
    throw new Error(message);
  }
  return response.json();
}
const tabMenu = document.querySelector<HTMLElement>("#tab-menu")!;
const menuRename = document.querySelector<HTMLButtonElement>("#tab-menu-rename")!;
let menuTab: HTMLElement | undefined;
function closeTabMenu(restoreFocus = false) {
  const tab = menuTab;
  menuTab = undefined;
  tabMenu.hidden = true;
  if (restoreFocus && tab?.isConnected) tab.querySelector<HTMLButtonElement>(".tab-select")!.focus();
}
function openTabMenu(tab: HTMLElement, event: MouseEvent) {
  event.preventDefault();
  hideFolderTooltip();
  menuTab = tab;
  tabMenu.hidden = false;
  const bounds = tab.getBoundingClientRect();
  const x = event.clientX || bounds.left;
  const y = event.clientY || bounds.bottom;
  tabMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - tabMenu.offsetWidth - 8))}px`;
  tabMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - tabMenu.offsetHeight - 8))}px`;
  menuRename.focus();
}
menuRename.onclick = () => {
  const tab = menuTab;
  closeTabMenu(true);
  if (tab?.isConnected) openRenameDialog(tab.dataset.session!, tab.dataset.name!);
};
document.addEventListener("pointerdown", event => {
  if (!tabMenu.contains(event.target as Node)) closeTabMenu();
});
tabMenu.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeTabMenu(true); }
  else if (event.key === "Tab") closeTabMenu();
  else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); menuRename.focus(); }
});
window.addEventListener("blur", () => closeTabMenu());
window.addEventListener("resize", () => closeTabMenu());
sessionPicker.addEventListener("scroll", () => closeTabMenu());
const folderTooltip = document.querySelector<HTMLElement>("#folder-tooltip")!;
let tooltipTab: HTMLElement | undefined;
let tooltipRequest = 0;
function hideFolderTooltip() {
  ++tooltipRequest;
  tooltipTab?.querySelector(".tab-select")?.removeAttribute("aria-describedby");
  tooltipTab = undefined;
  folderTooltip.hidden = true;
}
function showFolderTooltip(tab: HTMLElement, text: string) {
  if (!tab.isConnected) return;
  folderTooltip.textContent = text;
  folderTooltip.hidden = false;
  const bounds = tab.getBoundingClientRect();
  folderTooltip.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - folderTooltip.offsetWidth - 8))}px`;
  folderTooltip.style.top = `${bounds.bottom + 8}px`;
}
sessionPicker.addEventListener("scroll", hideFolderTooltip);
window.addEventListener("resize", hideFolderTooltip);
function applySessionNames(list: { id: string; name: string }[]) {
  for (const tab of sessionPicker.querySelectorAll<HTMLElement>(".terminal-tab")) {
    const item = list.find(item => item.id === tab.dataset.session);
    if (!item) continue;
    tab.dataset.name = item.name;
    const name = tab.querySelector(".tab-name")!;
    if (name.textContent !== item.name) name.textContent = item.name;
    const close = tab.querySelector<HTMLButtonElement>(".tab-close")!;
    close.title = `Close ${item.name}`;
    close.setAttribute("aria-label", close.title);
  }
  updateTabs();
}
async function refreshSessions(current: number) {
  const list: { id: string; name: string }[] = await api("/api/terminals");
  if (current !== generation) return;
  if (!list.some((item) => item.id === sessionId)) sessionId = list[0]?.id || "";
  hideFolderTooltip();
  closeTabMenu();
  const existing = new Map([...sessionPicker.querySelectorAll<HTMLElement>(".terminal-tab")].map(tab => [tab.dataset.session!, tab]));
  const tabs = list.map((item) => {
      const retained = existing.get(item.id);
      if (retained) return retained;
      const tab = document.createElement("div");
      tab.className = "terminal-tab";
      tab.dataset.session = item.id;
      tab.dataset.name = item.name;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab-select";
      button.dataset.session = item.id;
      button.setAttribute("aria-description", "Right-click, double-click or press F2 to rename");
      tab.addEventListener("contextmenu", event => openTabMenu(tab, event));
      const showFolder = async () => {
        if (!tabMenu.hidden) return;
        const request = ++tooltipRequest;
        tooltipTab = tab;
        button.setAttribute("aria-describedby", "folder-tooltip");
        showFolderTooltip(tab, "Loading folder…");
        try {
          const result: { id?: string; cwd?: string } = await api("/api/terminals?cwd=" + encodeURIComponent(item.id));
          if (tooltipTab === tab && request === tooltipRequest) showFolderTooltip(tab, result.id === item.id && result.cwd ? result.cwd : "Current folder unavailable");
        } catch {
          if (tooltipTab === tab && request === tooltipRequest) showFolderTooltip(tab, "Current folder unavailable");
        }
      };
      tab.addEventListener("mouseenter", () => { void showFolder(); });
      tab.addEventListener("mouseleave", hideFolderTooltip);
      button.addEventListener("focus", () => { void showFolder(); });
      button.addEventListener("blur", hideFolderTooltip);
      button.addEventListener("dblclick", () => openRenameDialog(item.id, tab.dataset.name!));
      button.addEventListener("keydown", event => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          openTabMenu(tab, new window.MouseEvent("contextmenu"));
        }
        if (event.key === "F2") { event.preventDefault(); openRenameDialog(item.id, tab.dataset.name!); }
        if (event.key === "Escape") hideFolderTooltip();
      });
      button.setAttribute("aria-pressed", String(item.id === sessionId));
      tab.dataset.selected = String(item.id === sessionId);
      const dot = document.createElement("span");
      dot.className = "status-dot";
      dot.setAttribute("role", "img");
      dot.addEventListener("mouseenter", hideFolderTooltip);
      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = item.name;
      name.addEventListener("mouseenter", () => { void showFolder(); });
      button.append(dot, name);
      button.onclick = () => {
        if (sessionId === item.id) return;
        sessionId = item.id;
        sessionStorage.setItem("agentonweb-terminal", sessionId);
        focusOnConnect = true;
        void connect();
      };
      const reconnect = document.createElement("button");
      reconnect.type = "button";
      reconnect.className = "tab-reconnect";
      reconnect.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.34 5.66"/></svg>';
      reconnect.onclick = () => {
        if (sessionStates.get(item.id) !== "disconnected") return;
        sessionId = item.id;
        focusOnConnect = true;
        void connect();
      };
      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.title = `Close ${item.name}`;
      close.setAttribute("aria-label", close.title);
      close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
      close.onclick = () => openCloseDialog(item.id, tab.dataset.name!);
      tab.append(button, reconnect, close);
      return tab;
    });
  const retained = new Set(tabs);
  for (const tab of existing.values()) if (!retained.has(tab)) tab.remove();
  tabs.forEach((tab, index) => {
    const atIndex = sessionPicker.children[index] ?? null;
    if (atIndex !== tab) sessionPicker.insertBefore(tab, atIndex);
  });
  sessionStorage.setItem("agentonweb-terminal", sessionId);
  applySessionNames(list);
}

let socket: WebSocket | undefined;
let epoch = "",
  lease = 0,
  active = false,
  resizeOwner = false,
  ready = false,
  retry: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let focusOnConnect = false;
let outputNoticeAt = 0;
function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function resize() {
  if (!active || !ready || !resizeOwner || !document.hasFocus() || document.hidden || container.clientWidth < 30 || container.clientHeight < 30) return;
  const size = fit.proposeDimensions();
  if (size && size.cols >= 2 && size.rows >= 2) send({ type: "resize", ...size, epoch, lease });
}
function input(data: string, binary = false) {
  if (!active || !ready) return;
  for (const chunk of splitInput(data))
    send({
      type: binary ? "input-binary" : "input",
      data: chunk,
      epoch,
      lease,
    });
}
// Device replies come from the canonical headless terminal exactly once.
// The browser still emits all actual keyboard, composition, paste and mouse input.
for (const identifier of [
  { final: "c" },
  { prefix: ">", final: "c" },
  { prefix: "=", final: "c" },
  { final: "n" },
  { prefix: "?", final: "n" },
  { final: "t" },
]) {
  terminal.parser.registerCsiHandler(identifier, () => true);
}
for (const code of [4, 10, 11, 12]) terminal.parser.registerOscHandler(code, (data) => data.includes("?"));
terminal.onData((data) => input(data));
terminal.onBinary((data) => input(data, true));
function focusView() {
  if (ready && active && !document.hidden && document.hasFocus()) send({ type: "focus", epoch });
}
function blurView() {
  if (ready && resizeOwner) send({ type: "blur", epoch, lease });
  resizeOwner = false;
}
window.addEventListener("focus", focusView);
window.addEventListener("blur", blurView);
container.addEventListener("focusin", focusView);
container.addEventListener("pointerdown", focusView);
// Capture before xterm's text-only paste handler. Command+V supplies the
// clipboard event; the native CLI reads the host clipboard on Ctrl+V.
container.addEventListener("paste", event => {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const hasImage = Array.from(clipboard.items).some(item => item.type.startsWith("image/"))
    || Array.from(clipboard.files).some(file => file.type.startsWith("image/"));
  if (!hasImage) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  input("\x16");
}, true);
async function connect(automaticRetry = false) {
  if (parent !== window && !authorizedParent) return;
  const current = ++generation;
  clearTimeout(retry);
  for (const [id, state] of sessionStates) {
    if (id !== sessionId && (state === "connected" || state === "connecting")) sessionStates.set(id, "background");
  }
  setConnectionState("connecting");
  socket?.close();
  ready = active = resizeOwner = false;
  terminal.options.disableStdin = true;
  // Retain the last failure while retrying; don't flash an intermediate state
  // or repeatedly announce the same failure to assistive technology.
  if (!automaticRetry) showStatus("Connecting…");
  try {
    await refreshSessions(current);
    if (current !== generation) return;
    if (!sessionId) {
      terminal.reset();
      showStatus("No terminals. Click + to open your local shell.");
      return;
    }
    setConnectionState("connecting");
    const response = await fetch("/ticket?session=" + encodeURIComponent(sessionId), {
      headers: { "X-AgentOnWeb-Terminal": "1" },
    });
    if (!response.ok) throw new Error("Session expired. Reconnect from AgentOnWeb.");
    const info = await response.json();
    if (current !== generation) return;
    const ws = new WebSocket(`ws://${location.host}/terminal`, info.token);
    socket = ws;
    ws.onmessage = (event) => {
      if (current !== generation) return;
      const m = JSON.parse(event.data);
      if (m.type === "session-names") {
        applySessionNames(m.sessions);
      } else if (m.type === "snapshot") {
        epoch = m.epoch;
        setConnectionState(m.exitCode !== undefined ? "exited" : "connected");
        terminal.reset();
        terminal.resize(m.cols, m.rows);
        terminal.write(m.data, () => {
          if (current !== generation) return;
          ready = true;
          if (focusOnConnect) {
            focusOnConnect = false;
            terminal.focus();
          }
          focusView();
          resize();
        });
        if (m.exitCode !== undefined)
          showStatus(`Process exited (${m.exitCode}). Open a new terminal with +.`);
      } else if (m.type === "output" && m.epoch === epoch) {
        terminal.write(m.data, () => {
          if (current === generation && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "ack", sequence: m.sequence }));
        });
        if (nonce && Date.now() - outputNoticeAt > 1000) {
          outputNoticeAt = Date.now();
          parent.postMessage({ source: "agentonweb-surface", type: "surface.output", nonce }, "*");
        }
      } else if (m.type === "control") {
        setConnectionState(m.exited !== undefined ? "exited" : "connected");
        const wasActive = active;
        active = m.active;
        resizeOwner = m.resizeOwner === true;
        lease = m.lease;
        epoch = m.epoch;
        terminal.options.disableStdin = !active;
        showStatus(
          m.exited !== undefined
            ? `Process exited (${m.exited}). Open a new terminal with +.`
            : "Connected");
        if (!wasActive) focusView();
        if (document.hidden || !document.hasFocus()) blurView();
        resize();
      } else if (m.type === "resize") terminal.resize(m.cols, m.rows);
      else if (m.type === "exit") {
        setConnectionState("exited");
        active = false;
        terminal.options.disableStdin = true;
        showStatus(`Process exited (${m.code}). Open a new terminal with +.`);
      }
    };
    ws.onclose = (event) => {
      if (current !== generation) return;
      setConnectionState("disconnected");
      ready = active = resizeOwner = false;
      terminal.options.disableStdin = true;
      showStatus(
        event.code === 4401
          ? "Authorization revoked. Connect again from AgentOnWeb."
          : "Disconnected · process stays in the local host");
      if (event.code !== 4401) retry = setTimeout(() => { void connect(true); }, 1500);
    };
  } catch (error) {
    if (current === generation) {
      setConnectionState("disconnected");
      showStatus(error instanceof Error ? error.message : "Connection failed");
    }
  }
}
newButton.onclick = async () => {
  newButton.disabled = true;
  try {
    sessionId = (await api("/api/terminals", { action: "new" })).id;
    focusOnConnect = true;
    await connect();
  } catch (error) {
    showStatus(String(error));
  } finally {
    newButton.disabled = false;
  }
};
const renameDialog = document.querySelector<HTMLDialogElement>("#rename-dialog")!;
const renameInput = document.querySelector<HTMLInputElement>("#rename-name")!;
const renameError = document.querySelector<HTMLElement>("#rename-error")!;
const saveRename = document.querySelector<HTMLButtonElement>("#save-rename")!;
const cancelRename = document.querySelector<HTMLButtonElement>("#cancel-rename")!;
let renamingSessionId = "";
let renamePending = false;
function openRenameDialog(id: string, name: string) {
  if (renameDialog.open) return;
  hideFolderTooltip();
  renamingSessionId = id;
  renameInput.value = name;
  renameError.textContent = "";
  renameDialog.showModal();
  renameInput.focus();
  renameInput.select();
}
cancelRename.onclick = () => renameDialog.close();
renameDialog.oncancel = event => { if (renamePending) event.preventDefault(); };
document.querySelector<HTMLFormElement>("#rename-form")!.onsubmit = async event => {
  event.preventDefault();
  if (renamePending) return;
  const name = renameInput.value.trim();
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/u.test(name)) {
    renameError.textContent = "Use a name of 1–80 characters without line breaks.";
    return;
  }
  renamePending = true;
  saveRename.disabled = cancelRename.disabled = renameInput.disabled = true;
  try {
    const list = await api("/api/terminals", { action: "rename", id: renamingSessionId, name });
    applySessionNames(list);
    renameDialog.close();
  } catch (error) {
    renameError.textContent = error instanceof Error ? error.message : "Could not rename this terminal.";
  } finally {
    renamePending = false;
    saveRename.disabled = cancelRename.disabled = renameInput.disabled = false;
  }
};
const closeDialog = document.querySelector<HTMLDialogElement>("#close-dialog")!;
const confirmClose = document.querySelector<HTMLButtonElement>("#confirm-close")!;
const cancelClose = document.querySelector<HTMLButtonElement>("#cancel-close")!;
const closeError = document.querySelector<HTMLElement>("#close-error")!;
let closingSessionId = "";
let closePending = false;
function openCloseDialog(id: string, name: string) {
  if (closeDialog.open) return;
  closingSessionId = id;
  document.querySelector("#close-title")!.textContent = `Close ${name}?`;
  closeError.textContent = "";
  closeDialog.showModal();
}
cancelClose.onclick = () => closeDialog.close();
closeDialog.oncancel = (event) => {
  if (closePending) event.preventDefault();
};
confirmClose.onclick = async () => {
  if (!closingSessionId || closePending) return;
  closePending = true;
  confirmClose.disabled = cancelClose.disabled = true;
  try {
    await api("/api/terminals", { action: "close", id: closingSessionId });
    sessionStates.delete(closingSessionId);
    closeDialog.close();
    if (sessionId === closingSessionId) {
      sessionId = "";
      await connect();
    } else await refreshSessions(generation);
  } catch (error) {
    closeError.textContent = error instanceof Error ? error.message : "Could not close this terminal.";
  } finally {
    closePending = false;
    confirmClose.disabled = cancelClose.disabled = false;
  }
};
// Only the private setup link sets the separate administrator cookie. The
// extension's delegated terminal cookie cannot approve other extensions.
let connectionsSignature = "";
async function showConnections() {
  if (parent !== window) return;
  try {
    const data: {
      pending: { id: string; origin: string }[];
      grants: { id: string; origin: string }[];
    } = await api("/api/connections");
    const signature = JSON.stringify(data);
    if (signature === connectionsSignature) return;
    connectionsSignature = signature;
    const panel = document.querySelector<HTMLElement>("#connections")!;
    panel.hidden = false;
    const items = document.querySelector<HTMLElement>("#connection-items")!;
    items.replaceChildren();
    for (const item of [...data.pending, ...data.grants]) {
      const row = document.createElement("div");
      row.className = "connection";
      const label = document.createElement("span");
      label.textContent = item.origin;
      row.append(label);
      const pending = data.pending.some((p) => p.id === item.id);
      for (const action of pending ? ["allow", "deny"] : ["revoke"]) {
        const button = document.createElement("button");
        button.textContent = action === "allow" ? "Allow connection" : action === "deny" ? "Decline" : "Revoke";
        button.onclick = async () => {
          button.disabled = true;
          try {
            await api("/api/connections", { action, id: item.id });
            await showConnections();
          } catch (error) {
            showStatus(String(error));
          }
        };
        row.append(button);
      }
      items.append(row);
    }
    if (!data.pending.length && !data.grants.length)
      items.textContent = "Open AgentOnWeb on any website, choose Local terminal, then approve its request here.";
  } catch {
    /* Delegated terminal viewers have no admin access. */
  }
}
if (parent === window) {
  void showConnections();
  setInterval(() => {
    void showConnections();
  }, 2000);
}
new ResizeObserver(resize).observe(container);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) blurView();
  else focusView();
});
const nonce = new URLSearchParams(location.hash.slice(1)).get("agentonweb");
let authorizedParent = parent === window;
let mode = "focus",
  opacity = 0.82;
function presentation() {
  terminal.options.theme = {
    background:
      mode === "chill"
        ? `#15171c${Math.round(opacity * 255)
            .toString(16)
            .padStart(2, "0")}`
        : "#15171cff",
    foreground: "#f1f3f5",
  };
}
window.addEventListener("message", (event) => {
  if (event.source !== parent || !/^(chrome-extension|moz-extension|safari-web-extension):\/\//u.test(event.origin))
    return;
  const m = event.data;
  if (!nonce || m?.nonce !== nonce || m.source !== "agentonweb-extension") return;
  if (m.type === "surface.ready" && !authorizedParent) {
    authorizedParent = true;
    void connect();
  }
  if (m.type === "mode.set" && ["focus", "chill", "watch"].includes(m.mode)) mode = m.mode;
  if (m.type === "opacity.set" && typeof m.opacity === "number" && m.opacity >= 0 && m.opacity <= 1)
    opacity = m.opacity;
  presentation();
});
const optionTap = new OptionTapTracker();
window.addEventListener("keydown", (event) => optionTap.keydown(event), true);
window.addEventListener(
  "keyup",
  (event) => {
    if (optionTap.keyup(event) && nonce)
      parent.postMessage({ source: "agentonweb-surface", type: "site-pass.option-tap", nonce }, "*");
  },
  true,
);
window.addEventListener("blur", () => optionTap.reset());
if (parent === window) void connect();
