import type { OvercodeMode, RuntimeDescriptor } from "@overcode/connector-contract";

export const STATE_STORAGE_KEY = "overcode.surface-state";
export const CREDENTIAL_STORAGE_KEY = "overcode.runtime-credentials";
export const COOKIE_SCOPES_STORAGE_KEY = "overcode.cookie-scopes";

export type SurfaceConnection = "disconnected" | "connecting" | "awaiting-approval" | "connected" | "reconnecting";

export interface NativeSurfaceView {
  readonly runtimeId: string;
  readonly displayName: string;
  readonly url: string;
  readonly frameName: string;
}

export interface SurfaceViewState {
  readonly mode: OvercodeMode;
  readonly opacity: number;
  readonly connection: SurfaceConnection;
  readonly surface?: NativeSurfaceView;
  readonly runtimeId?: string;
  readonly runtime?: RuntimeDescriptor;
  readonly runtimes?: readonly { readonly id: string; readonly displayName: string }[];
  readonly approvalUrl?: string;
  readonly nativeUrl?: string;
  readonly error?: string;
}

export type ContentRequest =
  | { readonly source: "overcode-content"; readonly type: "state.get" }
  | { readonly source: "overcode-content"; readonly type: "mode.set"; readonly mode: OvercodeMode }
  | { readonly source: "overcode-content"; readonly type: "opacity.set"; readonly opacity: number }
  | { readonly source: "overcode-content"; readonly type: "runtime.connect"; readonly runtimeId?: string }
  | { readonly source: "overcode-content"; readonly type: "runtime.approval" };

export interface StateUpdate {
  readonly source: "overcode-background";
  readonly type: "state.update";
  readonly state: SurfaceViewState;
}

// Visibility belongs to each page, not to the shared runtime connection or mode.
// Only an explicit toolbar/keyboard action sends one of these messages.
export interface SurfaceCommand {
  readonly source: "overcode-background";
  readonly type: "surface.toggle" | "surface.show";
  readonly state: SurfaceViewState;
}

export function isSurfaceCommand(value: unknown): value is SurfaceCommand {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown; state?: unknown };
  return candidate.source === "overcode-background" &&
    (candidate.type === "surface.toggle" || candidate.type === "surface.show") && Boolean(candidate.state);
}

export function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown; mode?: unknown; opacity?: unknown; runtimeId?: unknown };
  if (candidate.source !== "overcode-content") return false;
  if (candidate.type === "state.get" || candidate.type === "runtime.approval") return true;
  if (candidate.type === "mode.set") return ["chill", "focus", "watch"].includes(String(candidate.mode));
  if (candidate.type === "opacity.set") return typeof candidate.opacity === "number" && Number.isFinite(candidate.opacity);
  return candidate.type === "runtime.connect" && (candidate.runtimeId === undefined || typeof candidate.runtimeId === "string");
}

export function isStateUpdate(value: unknown): value is StateUpdate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown; state?: unknown };
  return candidate.source === "overcode-background" && candidate.type === "state.update" && Boolean(candidate.state);
}
