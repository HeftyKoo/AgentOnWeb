/** Agent semantics are independent of PTY output and of the displayed terminal. */
export type AgentStatus = "idle" | "running" | "approval" | "completed" | "interrupted" | "ended";
export interface AgentSession {
  readonly id: string;
  readonly runtimeId: string;
  readonly terminalId: string;
  readonly agent: string;
  readonly status: AgentStatus;
  readonly title: string;
  readonly detail: string;
  readonly updatedAt: number;
  /** Changes only when attention is requested, so ordinary updates cannot replay a toast. */
  readonly attentionId: string;
}
export function parseAgentSessions(value: unknown): AgentSession[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error("Invalid agent sessions.");
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid agent session.");
    for (const key of ["id", "runtimeId", "terminalId", "agent", "title", "detail", "attentionId"])
      if (typeof item[key] !== "string" || item[key].length > (key === "detail" ? 500 : 200)) throw new Error("Invalid agent session field.");
    if (!item.id || !item.runtimeId || !item.terminalId || !["idle", "running", "approval", "completed", "interrupted", "ended"].includes(item.status)
      || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0) throw new Error("Invalid agent session state.");
    return { id: item.id, runtimeId: item.runtimeId, terminalId: item.terminalId, agent: item.agent,
      title: item.title, detail: item.detail, status: item.status, updatedAt: item.updatedAt, attentionId: item.attentionId };
  });
}
