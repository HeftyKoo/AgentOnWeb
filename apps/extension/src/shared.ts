import type { OvercodeMode } from "@overcode/shared-protocol";

export const STATE_STORAGE_KEY = "overcode.surface-state.v2";
export const CREDENTIAL_STORAGE_KEY = "overcode.bridge-credential.v1";

export type SurfaceConnection = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface HarnessSurfaceView {
  readonly runtimeId: string;
  readonly displayName: string;
  readonly url: string;
  readonly frameName: string;
}

export interface SurfaceViewState {
  readonly mode: OvercodeMode;
  readonly connection: SurfaceConnection;
  readonly paired: boolean;
  readonly endpoint: string;
  readonly surface?: HarnessSurfaceView;
  readonly error?: string;
}

export type ContentRequest =
  | { readonly source: "overcode-content"; readonly type: "state.get" }
  | { readonly source: "overcode-content"; readonly type: "mode.set"; readonly mode: OvercodeMode }
  | { readonly source: "overcode-content"; readonly type: "bridge.pair"; readonly endpoint: string; readonly pairingCode: string };

export interface StateUpdate {
  readonly source: "overcode-background";
  readonly type: "state.update";
  readonly state: SurfaceViewState;
}

export function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown };
  return candidate.source === "overcode-content" && typeof candidate.type === "string";
}

export function isStateUpdate(value: unknown): value is StateUpdate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown; state?: unknown };
  return candidate.source === "overcode-background" && candidate.type === "state.update" && Boolean(candidate.state);
}
