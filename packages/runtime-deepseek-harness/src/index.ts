import { randomUUID } from "node:crypto";
import { access, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { Readable as NodeReadable, Writable as NodeWritable } from "node:stream";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  PROTOCOL_VERSION,
  client as createAcpClientApp,
  methods,
  ndJsonStream,
  type ClientConnection,
  type ContentBlock,
  type InitializeResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ResumeSessionResponse,
  type SessionInfo,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import type {
  AgentEvent,
  AgentEventListener,
  AgentRuntime,
  ApprovalRequest,
  ApprovalResponse,
  CreateSessionInput,
  RuntimeCapabilities,
  RuntimeConnectionOptions,
  RuntimeConnectionState,
  RuntimeSession,
  Unsubscribe,
  WorkspaceRef,
} from "@overcode/runtime-api";

export const SUPPORTED_DSH_TAG = "dsh-v0.1.2-alpha.1";
export const SUPPORTED_DSH_COMMIT = "cd5ef8148158c3a752a658978873241fdf8e2bbc";

export interface DeepSeekHarnessLaunchOptions {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly onStderr?: (text: string) => void;
}

interface PendingApproval {
  readonly sessionId: string;
  readonly request: RequestPermissionRequest;
  readonly resolve: (response: RequestPermissionResponse) => void;
}

interface ActiveRun {
  readonly runId: string;
  readonly sessionId: string;
}

export class DeepSeekHarnessRuntime implements AgentRuntime {
  readonly #launch: Required<Pick<DeepSeekHarnessLaunchOptions, "command" | "args">> & DeepSeekHarnessLaunchOptions;
  readonly #listeners = new Set<AgentEventListener>();
  readonly #sessions = new Map<string, RuntimeSession>();
  readonly #pendingApprovals = new Map<string, PendingApproval>();
  readonly #activeRuns = new Map<string, ActiveRun>();
  #connectionState: RuntimeConnectionState = "disconnected";
  #child: ChildProcessWithoutNullStreams | undefined;
  #connection: ClientConnection | undefined;
  #initializeResponse: InitializeResponse | undefined;

  constructor(options: DeepSeekHarnessLaunchOptions = {}) {
    this.#launch = {
      ...options,
      command: options.command ?? "dsh",
      args: options.args ?? ["--profile", "acp"],
    };
  }

  async connect(_options: RuntimeConnectionOptions): Promise<void> {
    if (this.#connectionState === "connected") return;
    this.#connectionState = "connecting";

    const child = spawn(this.#launch.command, [...this.#launch.args], {
      cwd: this.#launch.cwd,
      env: { ...process.env, ...this.#launch.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#child = child;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.#launch.onStderr?.(chunk);
    });

    const clientApp = createAcpClientApp({ name: "overcode-deepseek-harness-adapter" })
      .onNotification(methods.client.session.update, ({ params }) => {
        this.#handleSessionUpdate(params);
        return Promise.resolve();
      })
      .onRequest(methods.client.session.requestPermission, ({ params }) => {
        return this.#handlePermissionRequest(params);
      });

    const connection = clientApp.connect(ndJsonStream(
      NodeWritable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      NodeReadable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    ));
    this.#connection = connection;

    child.once("exit", (code, signal) => {
      if (this.#connectionState === "disconnected") return;
      this.#connectionState = "failed";
      const summary = `DeepSeek Harness exited (${signal ?? code ?? "unknown"}).`;
      for (const run of this.#activeRuns.values()) {
        this.#emit({
          type: "agent.failed",
          sessionId: run.sessionId,
          runId: run.runId,
          occurredAt: now(),
          summary,
        });
      }
      this.#activeRuns.clear();
      this.#cancelPendingApprovals();
    });

    try {
      const initialized = await Promise.race([
        connection.agent.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {},
        }),
        processFailure(child),
      ]);
      if (initialized.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`Unsupported ACP protocol ${initialized.protocolVersion}; expected ${PROTOCOL_VERSION}.`);
      }
      const sessionCapabilities = initialized.agentCapabilities?.sessionCapabilities;
      if (!sessionCapabilities?.list || !sessionCapabilities.resume || !sessionCapabilities.close) {
        throw new Error(
          `DeepSeek Harness ACP is missing persistent session capabilities. Pin ${SUPPORTED_DSH_TAG} (${SUPPORTED_DSH_COMMIT.slice(0, 12)}).`,
        );
      }
      this.#initializeResponse = initialized;
      this.#connectionState = "connected";
    } catch (error) {
      this.#connectionState = "failed";
      await this.#disposeChild();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.#connectionState = "disconnected";
    this.#cancelPendingApprovals();
    this.#connection?.close();
    this.#connection = undefined;
    await this.#disposeChild();
  }

  getConnectionState(): RuntimeConnectionState {
    return this.#connectionState;
  }

  getCapabilities(): Promise<RuntimeCapabilities> {
    this.#requireAgent();
    const supported: RuntimeCapabilities["supported"] = [
      "sessions",
      "resume",
      "tool-calls",
      "approvals",
      "cancellation",
      "workspace",
    ];
    return Promise.resolve({ supported });
  }

  async listSessions(): Promise<readonly RuntimeSession[]> {
    const agent = this.#requireAgent();
    const found: SessionInfo[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await agent.request(methods.agent.session.list, cursor ? { cursor } : {});
      found.push(...page.sessions);
      cursor = page.nextCursor;
    } while (cursor);

    const sessions = found.map((info) => this.#sessionFromInfo(info));
    for (const session of sessions) this.#sessions.set(session.id, session);
    for (const active of this.#sessions.values()) {
      if (!sessions.some((session) => session.id === active.id)) sessions.push(active);
    }
    return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createSession(input: CreateSessionInput): Promise<RuntimeSession> {
    await assertWorkspace(input.workspace);
    const agent = this.#requireAgent();
    const response = await agent.request(methods.agent.session.new, {
      cwd: input.workspace.path,
      mcpServers: [],
    });
    const timestamp = now();
    const session: RuntimeSession = {
      id: response.sessionId,
      workspace: input.workspace,
      title: input.title ?? `Overcode · ${input.workspace.label}`,
      status: "idle",
      createdAt: timestamp,
      updatedAt: timestamp,
      runtimeMetadata: metadata({ configOptions: response.configOptions ?? [] }),
    };
    this.#sessions.set(session.id, session);
    return session;
  }

  async resumeSession(sessionId: string): Promise<RuntimeSession> {
    const known = this.#sessions.get(sessionId)
      ?? (await this.listSessions()).find((session) => session.id === sessionId);
    if (!known) throw new Error(`DeepSeek Harness session not found: ${sessionId}`);
    await assertWorkspace(known.workspace);
    let response: ResumeSessionResponse | undefined;
    try {
      response = await this.#requireAgent().request(methods.agent.session.resume, {
        sessionId,
        cwd: known.workspace.path,
        mcpServers: [],
      });
    } catch (error) {
      if (!isAlreadyActiveSession(error)) throw error;
    }
    const resumed: RuntimeSession = {
      ...known,
      status: "idle",
      updatedAt: now(),
      ...(response
        ? { runtimeMetadata: metadata({ configOptions: response.configOptions ?? [] }) }
        : {}),
    };
    this.#sessions.set(sessionId, resumed);
    return resumed;
  }

  async sendPrompt(input: { readonly sessionId: string; readonly prompt: string }): Promise<{ readonly runId: string }> {
    const agent = this.#requireAgent();
    if (!this.#sessions.has(input.sessionId)) throw new Error(`Unknown active session: ${input.sessionId}`);
    if (this.#activeRuns.has(input.sessionId)) throw new Error("This session already has a prompt in flight.");
    const runId = randomUUID();
    const run = { runId, sessionId: input.sessionId };
    this.#activeRuns.set(input.sessionId, run);
    this.#emit({ type: "agent.started", sessionId: input.sessionId, runId, occurredAt: now() });
    this.#emit({ type: "agent.running", sessionId: input.sessionId, runId, occurredAt: now() });

    void agent.request(methods.agent.session.prompt, {
      sessionId: input.sessionId,
      prompt: [{ type: "text", text: input.prompt }],
    }).then(
      (response) => {
        this.#activeRuns.delete(input.sessionId);
        this.#touchSession(input.sessionId, "completed");
        this.#emit({
          type: "agent.completed",
          sessionId: input.sessionId,
          runId,
          occurredAt: now(),
          summary: response.stopReason,
          runtimeMetadata: metadata({ stopReason: response.stopReason }),
        });
      },
      (error: unknown) => {
        this.#activeRuns.delete(input.sessionId);
        this.#touchSession(input.sessionId, "failed");
        this.#emit({
          type: "agent.failed",
          sessionId: input.sessionId,
          runId,
          occurredAt: now(),
          summary: safeError(error),
        });
      },
    );
    return { runId };
  }

  async cancel(sessionId: string): Promise<void> {
    await this.#requireAgent().notify(methods.agent.session.cancel, { sessionId });
  }

  respondToApproval(response: ApprovalResponse): Promise<void> {
    const pending = this.#pendingApprovals.get(response.approvalId);
    if (!pending || pending.sessionId !== response.sessionId) {
      return Promise.reject(new Error("This approval is no longer pending."));
    }
    const selected = pending.request.options.find((option) => option.optionId === response.choiceId);
    pending.resolve(selected
      ? { outcome: { outcome: "selected", optionId: selected.optionId } }
      : { outcome: { outcome: "cancelled" } });
    this.#pendingApprovals.delete(response.approvalId);
    this.#emit({
      type: "approval.resolved",
      sessionId: response.sessionId,
      approvalId: response.approvalId,
      choiceId: response.choiceId,
      occurredAt: now(),
    });
    this.#emit({ type: "agent.running", sessionId: response.sessionId, occurredAt: now() });
    return Promise.resolve();
  }

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #handleSessionUpdate(notification: SessionNotification): void {
    const { sessionId, update } = notification;
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const text = contentText(update.content);
        if (text) {
          this.#emit({
            type: "message.delta",
            sessionId,
            messageId: update.messageId ?? randomUUID(),
            role: "assistant",
            text,
            occurredAt: now(),
            runtimeMetadata: metadata({ granularity: "committed-block", update }),
          });
        }
        break;
      }
      case "tool_call":
        {
        const summary = summarizeUnknown(update.rawInput);
        this.#emit({
          type: "tool.started",
          sessionId,
          toolCallId: update.toolCallId,
          toolName: update.title,
          occurredAt: now(),
          runtimeMetadata: metadata({ update }),
          ...(summary ? { summary } : {}),
        });
        break;
        }
      case "tool_call_update":
        if (update.status === "completed" || update.status === "failed") {
          this.#emit({
            type: update.status === "failed" ? "tool.failed" : "tool.completed",
            sessionId,
            toolCallId: update.toolCallId,
            toolName: update.title ?? "Tool call",
            occurredAt: now(),
            runtimeMetadata: metadata({ update }),
          });
        }
        break;
      default:
        break;
    }
  }

  #handlePermissionRequest(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const approvalId = randomUUID();
    const description = summarizeUnknown(request.toolCall.rawInput);
    const approval: ApprovalRequest = {
      id: approvalId,
      sessionId: request.sessionId,
      title: request.toolCall.title ?? "Sensitive tool action",
      risk: request.toolCall.kind === "delete" || request.toolCall.kind === "execute" ? "high" : "medium",
      choices: request.options.map((option) => ({
        id: option.optionId,
        label: option.name,
        kind: option.kind === "allow_once" || option.kind === "allow_always"
          ? "approve"
          : option.kind === "reject_once" || option.kind === "reject_always"
            ? "deny"
            : "custom",
      })),
      ...(description ? { description } : {}),
    };
    this.#emit({
      type: "approval.requested",
      sessionId: request.sessionId,
      approval,
      occurredAt: now(),
      runtimeMetadata: metadata({ request }),
    });
    this.#emit({ type: "agent.waiting", sessionId: request.sessionId, occurredAt: now() });
    return new Promise((resolve) => {
      this.#pendingApprovals.set(approvalId, { sessionId: request.sessionId, request, resolve });
    });
  }

  #requireAgent(): ClientConnection["agent"] {
    if (this.#connectionState !== "connected" || !this.#connection) {
      throw new Error("DeepSeek Harness ACP is not connected.");
    }
    return this.#connection.agent;
  }

  #sessionFromInfo(info: SessionInfo): RuntimeSession {
    const existing = this.#sessions.get(info.sessionId);
    const workspace = workspaceFromPath(info.cwd);
    const updatedAt = info.updatedAt ?? existing?.updatedAt ?? now();
    return {
      id: info.sessionId,
      workspace,
      title: info.title ?? existing?.title ?? `DeepSeek Harness · ${workspace.label}`,
      status: existing?.status ?? "idle",
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
      runtimeMetadata: metadata({ sessionInfo: info }),
    };
  }

  #touchSession(sessionId: string, status: RuntimeSession["status"]): void {
    const session = this.#sessions.get(sessionId);
    if (session) this.#sessions.set(sessionId, { ...session, status, updatedAt: now() });
  }

  #emit(event: AgentEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #cancelPendingApprovals(): void {
    for (const pending of this.#pendingApprovals.values()) {
      pending.resolve({ outcome: { outcome: "cancelled" } });
    }
    this.#pendingApprovals.clear();
  }

  async #disposeChild(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.stdin.end();
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4_000)),
    ]);
    if (!exited) child.kill("SIGTERM");
  }
}

function isAlreadyActiveSession(error: unknown): boolean {
  return error instanceof Error && /session is already active/i.test(error.message);
}

function contentText(content: ContentBlock): string {
  return content.type === "text" ? content.text : "";
}

function workspaceFromPath(path: string): WorkspaceRef {
  const normalized = path.replace(/\/+$/, "");
  return {
    id: `local:${normalized}`,
    path: normalized,
    label: normalized.split("/").at(-1) || normalized,
  };
}

async function assertWorkspace(workspace: WorkspaceRef): Promise<void> {
  if (!isAbsolute(workspace.path)) throw new Error("The workspace path must be absolute.");
  const details = await stat(workspace.path);
  if (!details.isDirectory()) throw new Error("The workspace path is not a directory.");
  await access(workspace.path);
}

function metadata(value: unknown): Readonly<Record<string, unknown>> {
  return { deepseekHarness: { acp: value } };
}

function summarizeUnknown(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  } catch {
    return undefined;
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "DeepSeek Harness request failed.";
}

function now(): string {
  return new Date().toISOString();
}

function processFailure(child: ChildProcessWithoutNullStreams): Promise<never> {
  return new Promise((_, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      reject(new Error(`DeepSeek Harness exited before ACP initialization (${signal ?? code ?? "unknown"}).`));
    });
  });
}
