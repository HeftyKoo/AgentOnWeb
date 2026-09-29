import { createDock } from "./dock.js";
import { DEFAULT_SURFACE_OPACITY } from "./interaction.js";
import styles from "./overlay.css";
import type { SurfaceViewState } from "./shared.js";

const style = document.createElement("style");
style.textContent = styles;
document.head.append(style);

const container = document.getElementById("agentonweb-preview");
if (!container) throw new Error("Missing preview container");

container.className = "agentonweb-root";
const shell = document.createElement("section");
shell.className = "surface-shell";
const frame = document.createElement("iframe");
frame.className = "runtime-frame";
frame.title = "DeepSeek Harness native surface preview";
frame.src = new URL(location.href).searchParams.get("surface") ?? "about:blank";
const dock = createDock({ localModeShortcuts: true });
let state: SurfaceViewState = {
  mode: "chill",
  opacity: DEFAULT_SURFACE_OPACITY,
  connection: "connected",
  runtimeId: "terminal",
  runtimes: [{ id: "terminal", displayName: "Local terminal" }, { id: "deepseek-harness", displayName: "DSH" }],
};
const activityPreview = new URL(location.href).searchParams.has("activity");
if (activityPreview) {
  state = { ...state, agentSessions: [
    { id: "terminal:one", terminalId: "one", runtimeId: "terminal", agent: "Codex", title: "Add session notifications", detail: "~/Project/AgentOnWeb", status: "running", updatedAt: 2, attentionId: "" },
    { id: "terminal:two", terminalId: "two", runtimeId: "terminal", agent: "Codex", title: "Review terminal navigation", detail: "~/Project/AgentOnWeb", status: "running", updatedAt: 1, attentionId: "" },
  ] };
}
const render = () => {
  container.dataset.mode = state.mode;
  container.style.setProperty("--agentonweb-surface-opacity", String(state.opacity));
  dock.render(state);
};
dock.onRuntime = runtimeId => { state = { ...state, runtimeId }; render(); };
dock.onMode = (mode) => {
  state = { ...state, mode };
  render();
};
dock.onOpacity = (opacity) => {
  state = { ...state, opacity };
  render();
};
dock.onOpacityPreview = (opacity) => {
  container.style.setProperty("--agentonweb-surface-opacity", String(opacity));
};
if (activityPreview) {
  const tools = document.createElement("div");
  tools.style.cssText = "position:fixed;left:24px;top:24px;z-index:10;padding:20px;background:#17201c;color:#dbe8e0;border-radius:12px;font:14px system-ui;pointer-events:auto";
  const title = document.createElement("p"); title.textContent = "Agent activity preview · simulated events";
  const result = document.createElement("p"); result.textContent = "Click a session to open its terminal.";
  tools.append(title);
  for (const status of ["approval", "completed", "running"] as const) {
    const button = document.createElement("button"); button.textContent = `Simulate ${status}`;
    button.style.cssText = "margin:4px;padding:8px";
    button.onclick = () => {
      state = { ...state, agentSessions: state.agentSessions!.map((item, index) => index ? item : { ...item, status,
        detail: status === "approval" ? "Allow running integration tests?" : "~/Project/AgentOnWeb", attentionId: crypto.randomUUID() }) };
      render();
    };
    tools.append(button);
  }
  tools.append(result);
  dock.onSession = session => { result.textContent = `Opened terminal: ${session.terminalId} — ${session.title}`; dock.setExpanded(false); };
  container.append(tools);
}
dock.setExpanded(true);
shell.append(frame, dock.element);
container.append(shell);
render();

if (activityPreview) dock.setExpanded(true);
