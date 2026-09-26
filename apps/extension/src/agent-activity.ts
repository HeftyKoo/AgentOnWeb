import type { AgentSession } from "@agentonweb/connector-contract";

const labels = { idle: "Ready", running: "Working", approval: "Needs approval", completed: "Completed", interrupted: "Interrupted", ended: "Ended" };
const priority = { approval: 0, running: 1, completed: 2, interrupted: 3, idle: 4, ended: 5 };
export function createAgentActivity(activate: (session: AgentSession) => void, read: (id: string) => void) {
  const element = document.createElement("section");
  element.className = "agent-sessions";
  element.setAttribute("aria-label", "Agent sessions");
  const toast = document.createElement("aside");
  toast.className = "agent-notification";
  toast.setAttribute("aria-label", "Agent notification");
  toast.hidden = true;
  const announcement = document.createElement("span");
  announcement.className = "agent-announcement";
  announcement.setAttribute("role", "status");
  const open = document.createElement("button");
  open.type = "button";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss notification");
  toast.append(announcement, open, dismiss);
  let current: AgentSession | undefined;
  let initialized = false;
  const mountedAt = Date.now();
  const seen = new Set<string>();
  const rows = new Map<string, HTMLButtonElement>();
  const queue: AgentSession[] = [];
  const advance = () => {
    current = queue.shift();
    toast.hidden = !current;
    if (current) {
      toast.dataset.status = current.status;
      announcement.textContent = `${current.agent}: ${labels[current.status]}. ${current.title}`;
      open.replaceChildren(rowContent(current));
      open.setAttribute("aria-label", `${labels[current.status]}: ${current.title}. Open terminal`);
    }
  };
  open.onclick = () => { if (current) { read(current.attentionId); activate(current); } advance(); };
  dismiss.onclick = () => { if (current) read(current.attentionId); advance(); };
  function render(sessions: readonly AgentSession[], readAttentionIds: readonly string[] = []) {
    const readIds = new Set(readAttentionIds);
    readAttentionIds.forEach(id => seen.add(id));
    const sorted = [...sessions].filter(item => item.status !== "ended").sort((a, b) => priority[a.status] - priority[b.status] || b.updatedAt - a.updatedAt);
    const ids = new Set(sorted.map(item => item.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    element.querySelector(".agent-empty")?.remove();
    sorted.forEach((item, index) => {
      let row = rows.get(item.id);
      if (!row) { row = document.createElement("button"); row.type = "button"; row.className = "agent-session"; rows.set(item.id, row); }
      row.dataset.status = item.status;
      row.setAttribute("aria-label", `${item.agent}: ${item.title}, ${labels[item.status]}. Open terminal`);
      row.replaceChildren(rowContent(item));
      row.onclick = () => { if (item.attentionId) read(item.attentionId); activate(item); };
      if (element.children[index] !== row) element.insertBefore(row, element.children[index] ?? null);
      if (item.attentionId && !seen.has(item.attentionId)) {
        seen.add(item.attentionId);
        if ((initialized || item.updatedAt >= mountedAt) && (item.status === "approval" || item.status === "completed")) queue.push(item);
      }
    });
    initialized ||= sessions.length > 0;
    while (seen.size > 1024) seen.delete(seen.values().next().value!);
    // Drop notifications whose session has closed or advanced to another state.
    for (let i = queue.length - 1; i >= 0; i--) if (readIds.has(queue[i]!.attentionId) || !sorted.some(item => item.id === queue[i]!.id && item.status === queue[i]!.status && item.attentionId === queue[i]!.attentionId)) queue.splice(i, 1);
    if (current && (readIds.has(current.attentionId) || !sorted.some(item => item.id === current!.id && item.status === current!.status && item.attentionId === current!.attentionId))) current = undefined;
    if (!current) advance();
    if (!sorted.length) {
      const empty = document.createElement("p"); empty.className = "agent-empty";
      empty.textContent = "No agent sessions yet. Run aow codex-hooks install once, trust the hooks in Codex /hooks, then launch Codex in a local terminal.";
      element.append(empty);
    }
    return { count: sorted.filter(item => item.status === "running" || item.status === "approval").length,
      approval: sorted.some(item => item.status === "approval"), hasSessions: sorted.length > 0 };
  }
  return { element, toast, render };
}
function rowContent(item: AgentSession): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const meta = document.createElement("span"); meta.className = "agent-session-meta";
  const agent = document.createElement("span"); agent.textContent = item.agent;
  const status = document.createElement("span"); status.className = "agent-status"; status.textContent = labels[item.status];
  meta.append(agent, status);
  const title = document.createElement("strong"); title.textContent = item.title;
  const detail = document.createElement("small"); detail.textContent = item.detail || "Open terminal";
  fragment.append(meta, title, detail);
  return fragment;
}
