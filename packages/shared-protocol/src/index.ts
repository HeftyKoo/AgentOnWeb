export const PROTOCOL_VERSION = 2 as const;
export const DEFAULT_BRIDGE_ENDPOINT = "ws://127.0.0.1:3847";

export type OvercodeMode = "chill" | "focus" | "watch";

export interface HarnessSurfaceCookie {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds: number;
}

export interface HarnessSurface {
  readonly runtimeId: string;
  readonly displayName: string;
  readonly url: string;
  readonly cookie: HarnessSurfaceCookie;
}

export interface ClientHello {
  readonly kind: "hello";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly credential?: string;
  readonly pairingCode?: string;
  readonly clientNonce: string;
}

export interface ServerHello {
  readonly kind: "hello";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly connectionId: string;
  readonly credential?: string;
  readonly paired: boolean;
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
  | HarnessSurface
  | { readonly ok: true };

export interface ServerResponse {
  readonly kind: "response";
  readonly id: string;
  readonly ok: boolean;
  readonly result?: RuntimeCommandResult;
  readonly error?: { readonly code: string; readonly message: string };
}

export type ClientFrame = ClientHello | ClientRequest;
export type ServerFrame = ServerHello | ServerReject | ServerResponse;
