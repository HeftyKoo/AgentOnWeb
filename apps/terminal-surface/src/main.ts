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
const control = document.querySelector<HTMLButtonElement>("#control")!;
const image = document.querySelector<HTMLButtonElement>("#image")!;
terminal.open(container);
const sessionPicker = document.querySelector<HTMLSelectElement>("#sessions")!;
const newButton = document.querySelector<HTMLButtonElement>("#new")!;
const closeButton = document.querySelector<HTMLButtonElement>("#close")!;
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
async function refreshSessions(current: number) {
  const list: { id: string; name: string }[] = await api("/api/terminals");
  if (current !== generation) return;
  sessionPicker.replaceChildren(
    ...list.map((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      return option;
    }),
  );
  if (!list.some((item) => item.id === sessionId)) sessionId = list[0]?.id || "";
  sessionPicker.value = sessionId;
  sessionStorage.setItem("agentonweb-terminal", sessionId);
  closeButton.disabled = !sessionId;
}

let socket: WebSocket | undefined;
let epoch = "",
  lease = 0,
  active = false,
  ready = false,
  retry: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let focusOnConnect = false;
let outputNoticeAt = 0;
function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function resize() {
  if (!active || !ready || document.hidden || container.clientWidth < 30 || container.clientHeight < 30) return;
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
control.onclick = () => {
  send({ type: "take-control" });
  terminal.focus();
};
image.onclick = () => {
  input("\x16");
  terminal.focus();
};
async function connect() {
  if (parent !== window && !authorizedParent) return;
  const current = ++generation;
  clearTimeout(retry);
  socket?.close();
  ready = active = false;
  terminal.options.disableStdin = true;
  control.disabled = image.disabled = true;
  status.textContent = "Connecting…";
  try {
    await refreshSessions(current);
    if (current !== generation) return;
    if (!sessionId) {
      terminal.reset();
      status.textContent = "No terminals. Click + to open your local shell.";
      return;
    }
    const response = await fetch("/ticket?session=" + encodeURIComponent(sessionId), {
      headers: { "X-AgentOnWeb-Terminal": "1" },
    });
    if (!response.ok) throw new Error("Session expired. Reconnect from AgentOnWeb.");
    const info = await response.json();
    if (current !== generation) return;
    document.querySelector("#details")!.textContent =
      `${info.executable}\nInitial directory: ${info.cwd}\nUse pwd in the shell to see its current directory.`;
    const ws = new WebSocket(`ws://${location.host}/terminal`, info.token);
    socket = ws;
    ws.onmessage = (event) => {
      if (current !== generation) return;
      const m = JSON.parse(event.data);
      if (m.type === "snapshot") {
        epoch = m.epoch;
        terminal.reset();
        terminal.resize(m.cols, m.rows);
        terminal.write(m.data, () => {
          if (current !== generation) return;
          ready = true;
          control.disabled = m.exitCode !== undefined;
          if (focusOnConnect) {
            focusOnConnect = false;
            terminal.focus();
          }
          resize();
        });
        if (m.exitCode !== undefined)
          status.textContent = `Process exited (${m.exitCode}). Open a new terminal with +.`;
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
        active = m.active;
        lease = m.lease;
        epoch = m.epoch;
        terminal.options.disableStdin = !active;
        image.disabled = !active;
        control.textContent = active ? "You control this terminal" : "Control here";
        status.textContent =
          m.exited !== undefined
            ? `Process exited (${m.exited}). Open a new terminal with +.`
            : active
              ? "Connected"
              : "Read-only · take control to type";
        control.disabled = m.exited !== undefined;
        resize();
      } else if (m.type === "resize") terminal.resize(m.cols, m.rows);
      else if (m.type === "exit") {
        active = false;
        terminal.options.disableStdin = true;
        control.disabled = image.disabled = true;
        status.textContent = `Process exited (${m.code}). Open a new terminal with +.`;
      }
    };
    ws.onclose = (event) => {
      if (current !== generation) return;
      ready = active = false;
      terminal.options.disableStdin = true;
      control.disabled = image.disabled = true;
      status.textContent =
        event.code === 4401
          ? "Authorization revoked. Connect again from AgentOnWeb."
          : "Disconnected · process stays in the local host";
      if (event.code !== 4401) retry = setTimeout(connect, 1500);
    };
  } catch (error) {
    if (current === generation) status.textContent = error instanceof Error ? error.message : "Connection failed";
  }
}
sessionPicker.onchange = () => {
  sessionId = sessionPicker.value;
  sessionStorage.setItem("agentonweb-terminal", sessionId);
  void connect();
};
newButton.onclick = async () => {
  newButton.disabled = true;
  try {
    sessionId = (await api("/api/terminals", { action: "new" })).id;
    focusOnConnect = true;
    await connect();
  } catch (error) {
    status.textContent = String(error);
  } finally {
    newButton.disabled = false;
  }
};
const closeDialog = document.querySelector<HTMLDialogElement>("#close-dialog")!;
const confirmClose = document.querySelector<HTMLButtonElement>("#confirm-close")!;
const cancelClose = document.querySelector<HTMLButtonElement>("#cancel-close")!;
const closeError = document.querySelector<HTMLElement>("#close-error")!;
let closingSessionId = "";
let closePending = false;
closeButton.onclick = () => {
  if (!sessionId || closeDialog.open) return;
  closingSessionId = sessionId;
  const name = sessionPicker.selectedOptions[0]?.textContent || "terminal";
  document.querySelector("#close-title")!.textContent = `Close ${name}?`;
  closeError.textContent = "";
  closeDialog.showModal();
};
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
    if (sessionId === closingSessionId) sessionId = "";
    closeDialog.close();
    await connect();
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
            status.textContent = String(error);
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
document.querySelector<HTMLButtonElement>("#reconnect")!.onclick = () => {
  void connect();
};
new ResizeObserver(resize).observe(container);
document.addEventListener("visibilitychange", resize);
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
