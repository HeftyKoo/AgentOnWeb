import { randomUUID } from "node:crypto";
import type { AgentSession, AgentStatus } from "@agentonweb/connector-contract";

const text = (value: unknown, limit: number) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/gu, " ").trim().slice(0, limit) : "";
const statuses: Record<string, AgentStatus> = {
  SessionStart: "idle", UserPromptSubmit: "running", PreToolUse: "running", PostToolUse: "running",
  PermissionRequest: "approval", TurnComplete: "completed", Interrupt: "interrupted", SessionEnd: "ended",
  PermissionNotification: "approval", Idle: "idle",
};
const piEvents: Record<string, string> = {
  session_start: "SessionStart", before_agent_start: "UserPromptSubmit", agent_start: "PreToolUse",
  tool_execution_start: "PreToolUse", tool_execution_end: "PostToolUse",
  ui_prompt_start: "PermissionRequest", ui_prompt_end: "PostToolUse", session_shutdown: "SessionEnd",
};

/** Normalize native hook inputs here; browser clients only see AgentSession. */
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
    if (data.agent !== undefined && data.agent !== "codex" && data.agent !== "claude-code" && data.agent !== "pi") return false;
    const claude = data.agent === "claude-code";
    const pi = data.agent === "pi";
    const agent = claude ? "Claude Code" : pi ? "Pi" : "Codex";
    let event = text(data.hook_event_name, 80);
    const inputResolved = pi && event === "ui_prompt_end";
    if (pi) {
      if (event === "agent_settled") event = data.is_interrupt === true ? "Interrupt" : "TurnComplete";
      else if (inputResolved && data.is_idle === true) event = "Idle";
      else event = Object.hasOwn(piEvents, event) ? piEvents[event]! : "";
    } else if (claude) {
      if (event === "Stop") event = "TurnComplete";
      else if (event === "StopFailure") event = "Interrupt";
      else if (event === "PostToolUseFailure") event = data.is_interrupt === true ? "Interrupt" : "PostToolUse";
      else if (event === "Notification") event = data.notification_type === "permission_prompt" ? "PermissionNotification" : data.notification_type === "idle_prompt" ? "Idle" : "";
      else if (!["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "SessionEnd"].includes(event)) return false;
    } else if (event === "PermissionNotification" || event === "Idle") return false;
    const status = statuses[event];
    const sessionId = text(data.session_id, 100);
    if (!Object.hasOwn(statuses, event) || !status || !sessionId || data.agent_id) return false;
    const id = `${terminalId}:${claude ? "claude-code:" : pi ? "pi:" : ""}${sessionId}`;
    const previous = this.#sessions.get(id);
    if ((claude || pi) && previous?.status === "ended" && !["SessionStart", "UserPromptSubmit", "SessionEnd"].includes(event)) return false;
    // Notify can include threads not observed by the root lifecycle hooks.
    // A completion may finish a known session, but cannot establish one.
    if (event === "TurnComplete" && !previous) return false;
    // Claude may omit prompt_id. A second Stop or delayed idle nudge must not
    // replay completion or erase a known approval/completion state.
    if ((claude || pi) && event === "TurnComplete" && previous?.status === "completed") return true;
    if (event === "Idle" && !pi && (!previous || previous.status === "approval" || previous.status === "completed" || previous.status === "ended")) return false;
    if (event === "PermissionNotification" && previous?.status === "approval") return true;
    if (event === "SessionStart" && data.source === "compact" && previous) return true;
    // /exit and resume have their own prompt IDs without a UserPromptSubmit.
    // These events affect the session, not the preceding model turn.
    const lifecycle = (claude || pi) && (event === "SessionStart" || event === "SessionEnd");
    if ((claude || pi) && event === "SessionStart") this.#turns.delete(id);
    const turn = text(data.turn_id, 100);
    const currentTurn = this.#turns.get(id);
    if (!claude && (!pi || event !== "PermissionRequest") && turn === currentTurn && previous && ["completed", "interrupted", "ended"].includes(previous.status)
      && ["PreToolUse", "PostToolUse", "PermissionRequest"].includes(event)) return false;
    // A late completion from the preceding turn must not finish the current one.
    if (turn && currentTurn && turn !== currentTurn && event !== "UserPromptSubmit" && !lifecycle) return false;
    if (turn && !lifecycle) this.#turns.set(id, turn);
    const toolId = text(data.tool_use_id, 100);
    const dedupe = `${id}:${turn}:${event}:${toolId}`;
    // Claude can resume work after Stop or interruption within the same prompt.
    // Its terminal states deduplicate consecutive events; a turn-wide key would
    // discard the final completion after a blocking Stop hook continues it.
    if (turn && (!claude || event === "UserPromptSubmit")
      && ["TurnComplete", "Interrupt", "UserPromptSubmit"].includes(event) && this.#seen.has(dedupe)) return true;
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
    const resolvesApproval = inputResolved || event === "PostToolUse" && (!pending || pending.size === 0);
    const nextStatus = previous?.status === "approval" && ["PreToolUse", "PostToolUse"].includes(event) && !resolvesApproval ? "approval" : status;
    if (nextStatus !== "approval") this.#approvalTools.delete(id);
    const tool = data.tool_input && typeof data.tool_input === "object" ? data.tool_input as Record<string, unknown> : {};
    const title = event === "UserPromptSubmit" ? text(data.prompt, 160) : "";
    const detail = event === "PermissionNotification" ? "Review in terminal"
      : event === "PermissionRequest" ? text(tool.description ?? data.tool_name, 500)
      : event === "TurnComplete" ? "Turn complete"
      : (claude || pi) && event === "Interrupt" ? "Turn stopped"
      : nextStatus === "approval" ? previous?.detail ?? "Review in terminal"
      : event === "SessionEnd" ? "Session ended" : text(data.cwd, 500);
    const permission = event === "PermissionRequest" || event === "PermissionNotification";
    const attention = (permission && (!claude || previous?.status !== "approval")) || (nextStatus === "completed" && event === "TurnComplete");
    if (!attention && previous?.status === nextStatus && previous.title === (title || previous.title) && previous.detail === detail) return true;
    const item: AgentSession = { id, runtimeId: "terminal", terminalId, agent, status: nextStatus,
      title: title || previous?.title || `${agent} session`, detail, updatedAt: Date.now(),
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
