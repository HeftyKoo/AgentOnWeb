import {
  CONNECTOR_PORTS,
  PROTOCOL_VERSION,
  encodeFrame,
  isLocalSurfaceUrl,
  isNativeSurface,
  isRuntimeDescriptor,
  parseServerFrame,
  type RuntimeCommand,
  type RuntimeCommandResult,
  type ServerAvailable,
  type AgentSession,
} from "@agentonweb/connector-contract";

export { isLocalSurfaceUrl, isNativeSurface, isRuntimeDescriptor } from "@agentonweb/connector-contract";

export interface AvailableRuntime extends ServerAvailable { readonly endpoint: string }

export async function discoverRuntimes(): Promise<AvailableRuntime[]> {
  const found = await Promise.all(CONNECTOR_PORTS.map(async (port) => {
    const endpoint = `ws://127.0.0.1:${port}`;
    if (!await isListening(endpoint)) return undefined;
    return new Promise<AvailableRuntime | undefined>((resolve) => {
      const socket = new WebSocket(endpoint);
      let finished = false;
      const finish = (result?: AvailableRuntime) => { if (finished) return; finished = true; clearTimeout(timer); resolve(result); socket.close(); };
      const timer = setTimeout(() => finish(), 1200);
      socket.onopen = () => socket.send(encodeFrame({ kind: "hello", protocolVersion: PROTOCOL_VERSION, intent: "discover" }));
      socket.onerror = () => finish();
      socket.onclose = () => finish();
      socket.onmessage = ({ data }) => {
        try {
          const frame = parseServerFrame(JSON.parse(String(data)));
          if (frame.kind === "available") {
            finish({ ...frame, endpoint });
          } else finish();
        } catch { finish(); }
      };
    });
  }));
  return found.filter((item): item is AvailableRuntime => Boolean(item));
}

async function isListening(endpoint: string): Promise<boolean> {
  const probe = new URL(endpoint);
  probe.protocol = "http:";
  try {
    // A ws server answers an ordinary HTTP request with 426. Fetch failures can
    // be handled quietly; constructing a WebSocket to every closed discovery
    // port makes browsers expose expected probe failures as extension errors.
    await fetch(probe.href, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(1_200) });
    return true;
  } catch {
    return false;
  }
}

export interface ConnectorCallbacks {
  sessions?(sessions: readonly AgentSession[]): void;
  pending(url: string): void;
  ready(credential?: string): void;
  closed(): void;
  rejected(code: string, message: string): void;
}

export class ConnectorClient {
  #socket: WebSocket | undefined;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #pending = new Map<string, { resolve(value: RuntimeCommandResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(readonly callbacks: ConnectorCallbacks) {}

  connect(endpoint: string, credential?: string): void {
    this.close();
    const socket = new WebSocket(endpoint);
    this.#socket = socket;
    let authorizationShown = false;
    socket.onopen = () => socket.send(encodeFrame({ kind: "hello", protocolVersion: PROTOCOL_VERSION,
      ...(this.callbacks.sessions ? { agentSessions: true } : {}),
      ...(credential ? { credential } : { intent: "pair" }) }));
    socket.onmessage = ({ data }) => {
      if (this.#socket !== socket) return;
      try {
        const frame = parseServerFrame(JSON.parse(String(data)));
        if (frame.kind === "agent.sessions") { this.callbacks.sessions?.(frame.sessions); return; }
        if (frame.kind === "pending") {
          if (!authorizationShown) { authorizationShown = true; this.callbacks.pending(frame.approvalUrl); }
        } else if (frame.kind === "hello") {
          this.callbacks.ready(frame.credential);
          this.#heartbeat = setInterval(() => { this.request({ type: "connection.ping" }).catch(() => socket.close()); }, 20_000);
        } else if (frame.kind === "error") this.callbacks.rejected(frame.code, frame.message);
        else if (frame.kind === "response") {
          const pending = this.#pending.get(frame.id);
          if (!pending) return;
          this.#pending.delete(frame.id); clearTimeout(pending.timer);
          if (frame.ok) pending.resolve(frame.result);
          else pending.reject(new Error(frame.error.message));
        }
      } catch (error) { this.callbacks.rejected("INVALID_FRAME", error instanceof Error ? error.message : "Invalid connector frame."); socket.close(); }
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.#socket !== socket) return;
      this.close(); this.callbacks.closed();
    };
  }

  request(command: RuntimeCommand): Promise<RuntimeCommandResult> {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Runtime is disconnected."));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error("Runtime request timed out.")); }, 10_000);
      this.#pending.set(id, { resolve, reject, timer });
      socket.send(encodeFrame({ kind: "request", id, command }));
    });
  }

  close(): void {
    const socket = this.#socket; this.#socket = undefined;
    socket?.close(); clearInterval(this.#heartbeat); this.#heartbeat = undefined;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Runtime disconnected.")); }
    this.#pending.clear();
  }
}
