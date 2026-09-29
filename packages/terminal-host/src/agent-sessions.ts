import { randomUUID } from "node:crypto";
import type { AgentSession, AgentStatus } from "@agentonweb/connector-contract";

const text = (value: unknown, limit: number) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/gu, " ").trim().slice(0, limit) : "";
const statuses: Record<string, AgentStatus> = {
  SessionStart: "idle", UserPromptSubmit: "running", PreToolUse: "running", PostToolUse: "running",
  PermissionRequest: "approval", TurnComplete: "completed", Interrupt: "interrupted", SessionEnd: "ended",
};

/** Only the Codex adapter knows hook names. Future adapters produce the same public sessions. */
export class AgentSessions {
  #sessions = new Map<string, AgentSession>();
  #turns = new Map<string, string>();
  #approvalTools = new Map<string, Map<string, number>>();
  #seen = new Set<string>();
  #listeners = new Set<() => void>();
  snapshot = (): AgentSession[] => [...this.#sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #emit() { for (const listener of this.#listeners) listener(); }
  ingest(terminalId: string, input: unknown): boolean {
    if (!input || typeof input !== "object" || Array.isArray(input)) return false;
    const data = input as Record<string, unknown>;
    const event = text(data.hook_event_name, 80);
    const status = statuses[event];
    const sessionId = text(data.session_id, 100);
    if (!Object.hasOwn(statuses, event) || !status || !sessionId || data.agent_id) return false;
    const id = `${terminalId}:${sessionId}`;
    const previous = this.#sessions.get(id);
    // Notify can include threads not observed by the root lifecycle hooks.
    // A completion may finish a known session, but cannot establish one.
    if (event === "TurnComplete" && !previous) return false;
    if (event === "SessionStart" && data.source === "compact" && previous) return true;
    const turn = text(data.turn_id, 100);
    const currentTurn = this.#turns.get(id);
    if (turn === currentTurn && previous && ["completed", "interrupted", "ended"].includes(previous.status)
      && ["PreToolUse", "PostToolUse", "PermissionRequest"].includes(event)) return false;
    // A late completion from the preceding turn must not finish the current one.
    if (turn && currentTurn && turn !== currentTurn && event !== "UserPromptSubmit") return false;
    if (turn) this.#turns.set(id, turn);
    const toolId = text(data.tool_use_id, 100);
    const dedupe = `${id}:${turn}:${event}:${toolId}`;
    if (turn && ["TurnComplete", "Interrupt", "UserPromptSubmit"].includes(event) && this.#seen.has(dedupe)) return true;
    if (turn) { this.#seen.add(dedupe); if (this.#seen.size > 2048) this.#seen.delete(this.#seen.values().next().value!); }
    const toolName = text(data.tool_name, 100);
    if (event === "PermissionRequest") {
      const pending = this.#approvalTools.get(id) ?? new Map<string, number>();
      pending.set(toolName, (pending.get(toolName) ?? 0) + 1);
      this.#approvalTools.set(id, pending);
    }
    // PermissionRequest has no documented tool_use_id. Only matching post-tool
    // evidence can clear this status; unrelated parallel tools must not clear it.
    const pending = this.#approvalTools.get(id);
    if (event === "PostToolUse" && toolName && pending?.has(toolName)) {
      const count = pending.get(toolName)!;
      if (count === 1) pending.delete(toolName); else pending.set(toolName, count - 1);
    }
    const resolvesApproval = event === "PostToolUse" && pending?.size === 0;
    const nextStatus = previous?.status === "approval" && ["PreToolUse", "PostToolUse"].includes(event) && !resolvesApproval ? "approval" : status;
    if (nextStatus !== "approval") this.#approvalTools.delete(id);
    const tool = data.tool_input && typeof data.tool_input === "object" ? data.tool_input as Record<string, unknown> : {};
    const title = event === "UserPromptSubmit" ? text(data.prompt, 160) : "";
    const detail = event === "PermissionRequest" ? text(tool.description ?? data.tool_name, 500)
      : event === "TurnComplete" ? "Turn complete"
      : nextStatus === "approval" ? previous?.detail ?? "Review in terminal"
      : event === "SessionEnd" ? "Session ended" : text(data.cwd, 500);
    const attention = event === "PermissionRequest" || (nextStatus === "completed" && event === "TurnComplete");
    if (!attention && previous?.status === nextStatus && previous.title === (title || previous.title) && previous.detail === detail) return true;
    const item: AgentSession = { id, runtimeId: "terminal", terminalId, agent: "Codex", status: nextStatus,
      title: title || previous?.title || "Codex session", detail, updatedAt: Date.now(),
      attentionId: attention ? randomUUID() : previous?.attentionId ?? "" };
    this.#sessions.set(id, item);
    if (this.#sessions.size > 128) {
      const oldest = this.#sessions.keys().next().value!;
      this.#sessions.delete(oldest); this.#turns.delete(oldest); this.#approvalTools.delete(oldest);
    }
    this.#emit();
    return true;
  }
  removeTerminal(terminalId: string): void {
    for (const [id, item] of this.#sessions) if (item.terminalId === terminalId) { this.#sessions.delete(id); this.#turns.delete(id); this.#approvalTools.delete(id); }
    this.#emit();
  }
}
