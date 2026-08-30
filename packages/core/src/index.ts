import type {
  AgentEvent,
  AgentRuntime,
  AgentStatus,
  ApprovalRequest,
  RuntimeConnectionState,
  RuntimeSession,
  WorkspaceRef,
} from "@overcode/runtime-api";

export type OvercodeMode = "chill" | "focus" | "watch";

export interface TimelineItem {
  readonly id: string;
  readonly event: AgentEvent;
}

export interface OvercodeSnapshot {
  readonly mode: OvercodeMode;
  readonly connection: RuntimeConnectionState;
  readonly workspace?: WorkspaceRef;
  readonly session?: RuntimeSession;
  readonly status: AgentStatus;
  readonly timeline: readonly TimelineItem[];
  readonly pendingApproval?: ApprovalRequest;
}

export const DEFAULT_SNAPSHOT: OvercodeSnapshot = {
  mode: "chill",
  connection: "disconnected",
  status: "idle",
  timeline: [],
};

export function nextMode(mode: OvercodeMode): OvercodeMode {
  if (mode === "chill") return "focus";
  if (mode === "focus") return "watch";
  return "chill";
}

export function reduceAgentEvent(
  snapshot: OvercodeSnapshot,
  event: AgentEvent,
): OvercodeSnapshot {
  const status = statusForEvent(event, snapshot.status);
  const pendingApproval = approvalForEvent(event, snapshot.pendingApproval);
  const timeline = [
    ...snapshot.timeline,
    { id: eventId(event), event },
  ].slice(-250);

  const { pendingApproval: _previousApproval, ...snapshotWithoutApproval } = snapshot;

  return {
    ...snapshotWithoutApproval,
    status,
    timeline,
    ...(pendingApproval ? { pendingApproval } : {}),
  };
}

export class RuntimeManager {
  readonly #runtime: AgentRuntime;
  #snapshot: OvercodeSnapshot = DEFAULT_SNAPSHOT;
  #listeners = new Set<(snapshot: OvercodeSnapshot) => void>();
  #unsubscribeRuntime: (() => void) | undefined;

  constructor(runtime: AgentRuntime) {
    this.#runtime = runtime;
  }

  getSnapshot(): OvercodeSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: OvercodeSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);
    return () => this.#listeners.delete(listener);
  }

  start(): void {
    this.#unsubscribeRuntime ??= this.#runtime.subscribe((event) => {
      this.#snapshot = reduceAgentEvent(this.#snapshot, event);
      this.#emit();
    });
  }

  stop(): void {
    this.#unsubscribeRuntime?.();
    this.#unsubscribeRuntime = undefined;
  }

  setMode(mode: OvercodeMode): void {
    this.#snapshot = { ...this.#snapshot, mode };
    this.#emit();
  }

  setConnection(connection: RuntimeConnectionState): void {
    this.#snapshot = { ...this.#snapshot, connection };
    this.#emit();
  }

  setSession(session: RuntimeSession): void {
    this.#snapshot = {
      ...this.#snapshot,
      session,
      workspace: session.workspace,
      status: session.status,
    };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

function statusForEvent(event: AgentEvent, fallback: AgentStatus): AgentStatus {
  switch (event.type) {
    case "agent.started":
      return "thinking";
    case "agent.running":
      return "working";
    case "agent.waiting":
      return "idle";
    case "agent.completed":
      return "completed";
    case "agent.failed":
      return "failed";
    case "tool.started":
      return "running-command";
    case "approval.requested":
      return "needs-approval";
    case "approval.resolved":
    case "tool.completed":
    case "tool.failed":
      return "working";
    case "message.delta":
    case "message.completed":
      return fallback;
  }
}

function approvalForEvent(
  event: AgentEvent,
  current: ApprovalRequest | undefined,
): ApprovalRequest | undefined {
  if (event.type === "approval.requested") return event.approval;
  if (event.type === "approval.resolved" && current?.id === event.approvalId) {
    return undefined;
  }
  return current;
}

function eventId(event: AgentEvent): string {
  switch (event.type) {
    case "message.delta":
    case "message.completed":
      return `${event.type}:${event.messageId}:${event.occurredAt}`;
    case "tool.started":
    case "tool.completed":
    case "tool.failed":
      return `${event.type}:${event.toolCallId}:${event.occurredAt}`;
    case "approval.requested":
      return `${event.type}:${event.approval.id}`;
    case "approval.resolved":
      return `${event.type}:${event.approvalId}`;
    case "agent.started":
    case "agent.running":
    case "agent.waiting":
    case "agent.completed":
    case "agent.failed":
      return `${event.type}:${event.runId ?? "none"}:${event.occurredAt}`;
  }
}
