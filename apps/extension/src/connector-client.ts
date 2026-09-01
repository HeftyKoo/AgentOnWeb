import { CONNECTOR_PORTS, PROTOCOL_VERSION, type NativeSurface, type RuntimeCommand, type RuntimeCommandResult, type ServerFrame, type ServerAvailable, type RuntimeDescriptor } from "@overcode/shared-protocol";

export interface AvailableRuntime extends ServerAvailable { readonly endpoint: string }

export function isRuntimeDescriptor(value: unknown): value is RuntimeDescriptor {
  if (!value || typeof value !== "object") return false;
  const runtime = value as Partial<RuntimeDescriptor>;
  return typeof runtime.id === "string" && /^[a-z0-9._-]{1,80}$/u.test(runtime.id)
    && typeof runtime.displayName === "string" && runtime.displayName.length <= 100
    && runtime.surfaceKind === "web" && typeof runtime.capabilities?.translucency === "boolean"
    && typeof runtime.capabilities?.optionTap === "boolean";
}

export function isLocalSurfaceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      && Boolean(url.port) && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  } catch { return false; }
}

export function isNativeSurface(value: unknown): value is NativeSurface {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const surface = value as Partial<NativeSurface>;
  return typeof surface.runtimeId === "string" && typeof surface.displayName === "string"
    && typeof surface.url === "string" && isLocalSurfaceUrl(surface.url) && Boolean(surface.cookie)
    && typeof surface.cookie?.name === "string" && /^[\w-]+$/u.test(surface.cookie.name)
    && typeof surface.cookie.value === "string" && surface.cookie.value.length > 0 && surface.cookie.value.length < 8192
    && typeof surface.cookie.maxAgeSeconds === "number" && Number.isFinite(surface.cookie.maxAgeSeconds) && surface.cookie.maxAgeSeconds > 0;
}

export async function discoverRuntimes(): Promise<AvailableRuntime[]> {
  const found = await Promise.all(CONNECTOR_PORTS.map(async (port) => {
    const endpoint = `ws://127.0.0.1:${port}`;
    if (!await isListening(endpoint)) return undefined;
    return new Promise<AvailableRuntime | undefined>((resolve) => {
      const socket = new WebSocket(endpoint);
      let finished = false;
      const finish = (result?: AvailableRuntime) => { if (finished) return; finished = true; clearTimeout(timer); resolve(result); socket.close(); };
      const timer = setTimeout(() => finish(), 1200);
      socket.onopen = () => socket.send(JSON.stringify({ kind: "hello", protocolVersion: PROTOCOL_VERSION, intent: "discover" }));
      socket.onerror = () => finish();
      socket.onclose = () => finish();
      socket.onmessage = ({ data }) => {
        try {
          const frame = JSON.parse(String(data)) as ServerFrame;
          if (frame.kind === "available" && frame.protocolVersion === PROTOCOL_VERSION
            && isRuntimeDescriptor(frame.runtime) && isLocalSurfaceUrl(frame.approvalUrl)) {
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
    // port makes Chrome expose expected probe failures as extension errors.
    await fetch(probe.href, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(1_200) });
    return true;
  } catch {
    return false;
  }
}

interface Callbacks {
  pending(url: string): void;
  ready(credential?: string): void;
  closed(): void;
  rejected(code: string, message: string): void;
}

export class ConnectorClient {
  #socket: WebSocket | undefined;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #pending = new Map<string, { resolve(value: RuntimeCommandResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(readonly callbacks: Callbacks) {}

  connect(endpoint: string, credential?: string): void {
    this.close();
    const socket = new WebSocket(endpoint);
    this.#socket = socket;
    let authorizationShown = false;
    socket.onopen = () => socket.send(JSON.stringify({ kind: "hello", protocolVersion: PROTOCOL_VERSION,
      ...(credential ? { credential } : { intent: "pair" }) }));
    socket.onmessage = ({ data }) => {
      if (this.#socket !== socket) return;
      try {
        const frame = JSON.parse(String(data)) as ServerFrame;
        if (frame.kind === "pending") {
          if (!isLocalSurfaceUrl(frame.approvalUrl)) throw new Error("Invalid native authorization URL.");
          if (!authorizationShown) { authorizationShown = true; this.callbacks.pending(frame.approvalUrl); }
        } else if (frame.kind === "hello") {
          if (frame.protocolVersion !== PROTOCOL_VERSION || !isRuntimeDescriptor(frame.runtime)) throw new Error("Runtime connector protocol mismatch.");
          this.callbacks.ready(frame.credential);
          this.#heartbeat = setInterval(() => { void this.request({ type: "connection.ping" }).catch(() => socket.close()); }, 20_000);
        } else if (frame.kind === "error") this.callbacks.rejected(frame.code, frame.message);
        else if (frame.kind === "response") {
          const pending = this.#pending.get(frame.id);
          if (!pending) return;
          this.#pending.delete(frame.id); clearTimeout(pending.timer);
          if (frame.ok && frame.result) pending.resolve(frame.result);
          else pending.reject(new Error(frame.error?.message ?? "Runtime request failed."));
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
      socket.send(JSON.stringify({ kind: "request", id, command }));
    });
  }

  close(): void {
    const socket = this.#socket; this.#socket = undefined;
    socket?.close(); clearInterval(this.#heartbeat); this.#heartbeat = undefined;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Runtime disconnected.")); }
    this.#pending.clear();
  }
}
