export const PROTOCOL_VERSION = 1 as const;
/** Small loopback-only discovery range; no network or arbitrary-port scanning. */
export const CONNECTOR_PORTS = [3847, 3848, 3849, 3850] as const;

export type OvercodeMode = "chill" | "focus" | "watch";

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
}

export interface ClientHello {
  readonly kind: "hello";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly credential?: string;
  readonly intent?: "discover" | "pair";
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

export interface ServerReject {
  readonly kind: "error";
  readonly code: string;
  readonly message: string;
}

export type RuntimeCommand =
  | { readonly type: "surface.get" }
  | { readonly type: "connection.ping" };

export interface ClientRequest {
  readonly kind: "request";
  readonly id: string;
  readonly command: RuntimeCommand;
}

export type RuntimeCommandResult =
  | NativeSurface
  | { readonly ok: true };

export interface ServerResponse {
  readonly kind: "response";
  readonly id: string;
  readonly ok: boolean;
  readonly result?: RuntimeCommandResult;
  readonly error?: { readonly code: string; readonly message: string };
}

export type ClientFrame = ClientHello | ClientRequest;
export type ServerFrame = ServerHello | ServerReject | ServerResponse | ServerAvailable | ServerPending;
