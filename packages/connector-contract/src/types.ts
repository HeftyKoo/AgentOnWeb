/** Exact wire compatibility version shared by both connector peers. */
export const PROTOCOL_VERSION = 1 as const;

/** Small loopback-only discovery range; no network or arbitrary-port scanning. */
export const CONNECTOR_PORTS = [3847, 3848, 3849, 3850] as const;

export interface SurfaceCookie {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds: number;
}

export interface NativeSurface {
  readonly runtimeId: string;
  readonly displayName: string;
  readonly url: string;
  readonly cookie: SurfaceCookie;
}

export interface RuntimeDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly surfaceKind: "web";
  readonly capabilities: { readonly translucency: boolean; readonly optionTap: boolean };
}

/** Runtime-specific lifecycle, native UI and authentication stay behind this Interface. */
export interface SurfaceAdapter {
  readonly runtime: RuntimeDescriptor;
  readonly approvalUrl: string;
  getSurface(): Promise<NativeSurface>;
  agentSessions?: {
    snapshot(): readonly import("./agent-sessions.js").AgentSession[];
    subscribe(listener: () => void): () => void;
  };
}

export interface ClientHello {
  readonly kind: "hello";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly credential?: string;
  readonly intent?: "discover" | "pair";
  /** Opt in to session updates; absent clients receive only the base protocol. */
  readonly agentSessions?: boolean;
}

export interface ServerHello {
  readonly kind: "hello";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly credential?: string;
  readonly runtime: RuntimeDescriptor;
}

export interface ServerAvailable {
  readonly kind: "available";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly runtime: RuntimeDescriptor;
  readonly approvalUrl: string;
}

export interface ServerPending {
  readonly kind: "pending";
  readonly approvalUrl: string;
}

export interface ProtocolFailure {
  readonly code: string;
  readonly message: string;
}

export interface ServerReject extends ProtocolFailure {
  readonly kind: "error";
}

export type RuntimeCommand =
  | { readonly type: "surface.get" }
  | { readonly type: "connection.ping" };

export interface ClientRequest {
  readonly kind: "request";
  readonly id: string;
  readonly command: RuntimeCommand;
}

export type RuntimeCommandResult = NativeSurface | { readonly ok: true };

export type ServerResponse =
  | { readonly kind: "response"; readonly id: string; readonly ok: true; readonly result: RuntimeCommandResult }
  | { readonly kind: "response"; readonly id: string; readonly ok: false; readonly error: ProtocolFailure };

export type ClientFrame = ClientHello | ClientRequest;
export type ServerFrame = ServerHello | ServerReject | ServerResponse | ServerAvailable | ServerPending
  | { readonly kind: "agent.sessions"; readonly sessions: readonly import("./agent-sessions.js").AgentSession[] };
