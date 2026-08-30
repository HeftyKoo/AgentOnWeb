export type RuntimeConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type AgentStatus =
  | "idle"
  | "thinking"
  | "working"
  | "running-command"
  | "needs-approval"
  | "completed"
  | "failed";

export type RuntimeCapability =
  | "sessions"
  | "resume"
  | "tool-calls"
  | "approvals"
  | "cancellation"
  | "workspace"
  | "subagents"
  | "plan-mode"
  | "background-jobs";

export interface RuntimeCapabilities {
  readonly supported: readonly RuntimeCapability[];
}

export interface WorkspaceRef {
  readonly id: string;
  readonly path: string;
  readonly label: string;
}

export interface RuntimeSession {
  readonly id: string;
  readonly workspace: WorkspaceRef;
  readonly title: string;
  readonly status: AgentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runtimeMetadata?: Readonly<Record<string, unknown>>;
}

export interface ApprovalRequest {
  readonly id: string;
  readonly sessionId: string;
  readonly title: string;
  readonly description?: string;
  readonly risk?: "low" | "medium" | "high";
  readonly choices: readonly ApprovalChoice[];
}

export interface ApprovalChoice {
  readonly id: string;
  readonly label: string;
  readonly kind: "approve" | "deny" | "custom";
}

interface EventBase {
  readonly sessionId: string;
  readonly occurredAt: string;
  readonly runtimeMetadata?: Readonly<Record<string, unknown>>;
}

export type AgentEvent =
  | (EventBase & {
      readonly type:
        | "agent.started"
        | "agent.running"
        | "agent.waiting"
        | "agent.completed"
        | "agent.failed";
      readonly runId?: string;
      readonly summary?: string;
    })
  | (EventBase & {
      readonly type: "message.delta" | "message.completed";
      readonly messageId: string;
      readonly role: "user" | "assistant" | "system";
      readonly text: string;
    })
  | (EventBase & {
      readonly type: "tool.started" | "tool.completed" | "tool.failed";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary?: string;
    })
  | (EventBase & {
      readonly type: "approval.requested";
      readonly approval: ApprovalRequest;
    })
  | (EventBase & {
      readonly type: "approval.resolved";
      readonly approvalId: string;
      readonly choiceId: string;
    });

export type AgentEventListener = (event: AgentEvent) => void;
export type Unsubscribe = () => void;

export interface RuntimeConnectionOptions {
  readonly endpoint: string;
  readonly credential?: string;
}

export interface CreateSessionInput {
  readonly workspace: WorkspaceRef;
  readonly title?: string;
}

export interface PromptInput {
  readonly sessionId: string;
  readonly prompt: string;
}

export interface ApprovalResponse {
  readonly sessionId: string;
  readonly approvalId: string;
  readonly choiceId: string;
  readonly customValue?: string;
}

export interface AgentRuntime {
  connect(options: RuntimeConnectionOptions): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): RuntimeConnectionState;
  getCapabilities(): Promise<RuntimeCapabilities>;
  listSessions(): Promise<readonly RuntimeSession[]>;
  createSession(input: CreateSessionInput): Promise<RuntimeSession>;
  resumeSession(sessionId: string): Promise<RuntimeSession>;
  sendPrompt(input: PromptInput): Promise<{ readonly runId: string }>;
  cancel(sessionId: string): Promise<void>;
  respondToApproval(response: ApprovalResponse): Promise<void>;
  subscribe(listener: AgentEventListener): Unsubscribe;
}
