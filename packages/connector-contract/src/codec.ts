import {
  PROTOCOL_VERSION,
  type ClientFrame,
  type NativeSurface,
  type ProtocolFailure,
  type RuntimeCommandResult,
  type RuntimeDescriptor,
  type ServerFrame,
} from "./types.js";

/** Raised only when untrusted wire data violates the connector contract. */
export class ProtocolError extends Error {}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown, message: string): UnknownRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProtocolError(message);
  return value as UnknownRecord;
};
const boundedString = (value: unknown, name: string, maximum: number): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new ProtocolError(`Invalid ${name}.`);
  return value;
};
const optionalCredential = (value: unknown): string | undefined => value === undefined
  ? undefined
  : boundedString(value, "credential", 512);

export function isLocalSurfaceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      && Boolean(url.port) && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  } catch {
    return false;
  }
}

export function parseRuntimeDescriptor(value: unknown): RuntimeDescriptor {
  const runtime = record(value, "Invalid runtime descriptor.");
  const capabilities = record(runtime.capabilities, "Invalid runtime capabilities.");
  const id = boundedString(runtime.id, "runtime id", 80);
  if (!/^[a-z0-9._-]+$/u.test(id)) throw new ProtocolError("Invalid runtime id.");
  const displayName = boundedString(runtime.displayName, "runtime display name", 100);
  if (runtime.surfaceKind !== "web" || typeof capabilities.translucency !== "boolean" || typeof capabilities.optionTap !== "boolean") {
    throw new ProtocolError("Invalid runtime descriptor.");
  }
  return { id, displayName, surfaceKind: "web", capabilities: {
    translucency: capabilities.translucency,
    optionTap: capabilities.optionTap,
  } };
}

export function isRuntimeDescriptor(value: unknown): value is RuntimeDescriptor {
  try { parseRuntimeDescriptor(value); return true; } catch { return false; }
}

export function parseNativeSurface(value: unknown): NativeSurface {
  const surface = record(value, "Invalid native surface.");
  const cookie = record(surface.cookie, "Invalid native surface cookie.");
  const runtimeId = boundedString(surface.runtimeId, "surface runtime id", 80);
  const displayName = boundedString(surface.displayName, "surface display name", 100);
  if (!isLocalSurfaceUrl(surface.url)) throw new ProtocolError("Invalid native surface URL.");
  const name = boundedString(cookie.name, "surface cookie name", 256);
  if (!/^[\w-]+$/u.test(name)) throw new ProtocolError("Invalid surface cookie name.");
  const cookieValue = boundedString(cookie.value, "surface cookie value", 8191);
  if (typeof cookie.maxAgeSeconds !== "number" || !Number.isFinite(cookie.maxAgeSeconds) || cookie.maxAgeSeconds <= 0) {
    throw new ProtocolError("Invalid surface cookie lifetime.");
  }
  return { runtimeId, displayName, url: surface.url, cookie: {
    name, value: cookieValue, maxAgeSeconds: cookie.maxAgeSeconds,
  } };
}

export function isNativeSurface(value: unknown): value is NativeSurface {
  try { parseNativeSurface(value); return true; } catch { return false; }
}

function parseFailure(value: unknown): ProtocolFailure {
  const failure = record(value, "Invalid protocol failure.");
  return {
    code: boundedString(failure.code, "failure code", 64),
    message: boundedString(failure.message, "failure message", 1000),
  };
}

function parseResult(value: unknown): RuntimeCommandResult {
  const result = record(value, "Invalid command result.");
  if (result.ok === true && Object.keys(result).length === 1) return { ok: true };
  return parseNativeSurface(result);
}

export function parseClientFrame(value: unknown): ClientFrame {
  const frame = record(value, "Invalid client frame.");
  if (frame.kind === "hello") {
    if (frame.protocolVersion !== PROTOCOL_VERSION) throw new ProtocolError("Connector protocol mismatch.");
    const credential = optionalCredential(frame.credential);
    const intent = frame.intent;
    if (intent !== undefined && intent !== "discover" && intent !== "pair") throw new ProtocolError("Invalid connection intent.");
    if (credential && intent) throw new ProtocolError("A credential and connection intent are mutually exclusive.");
    return {
      kind: "hello", protocolVersion: PROTOCOL_VERSION,
      ...(credential ? { credential } : {}),
      ...(intent ? { intent } : {}),
    };
  }
  if (frame.kind === "request") {
    const id = boundedString(frame.id, "request id", 128);
    const command = record(frame.command, "Invalid runtime command.");
    if (command.type !== "surface.get" && command.type !== "connection.ping") throw new ProtocolError("Unknown connector command.");
    return { kind: "request", id, command: { type: command.type } };
  }
  throw new ProtocolError("Unknown client frame.");
}

export function parseServerFrame(value: unknown): ServerFrame {
  const frame = record(value, "Invalid server frame.");
  if (frame.kind === "hello") {
    if (frame.protocolVersion !== PROTOCOL_VERSION) throw new ProtocolError("Connector protocol mismatch.");
    const credential = optionalCredential(frame.credential);
    return { kind: "hello", protocolVersion: PROTOCOL_VERSION, runtime: parseRuntimeDescriptor(frame.runtime),
      ...(credential ? { credential } : {}) };
  }
  if (frame.kind === "available") {
    if (frame.protocolVersion !== PROTOCOL_VERSION || !isLocalSurfaceUrl(frame.approvalUrl)) throw new ProtocolError("Invalid runtime discovery frame.");
    return { kind: "available", protocolVersion: PROTOCOL_VERSION, runtime: parseRuntimeDescriptor(frame.runtime), approvalUrl: frame.approvalUrl };
  }
  if (frame.kind === "pending") {
    if (!isLocalSurfaceUrl(frame.approvalUrl)) throw new ProtocolError("Invalid native authorization URL.");
    return { kind: "pending", approvalUrl: frame.approvalUrl };
  }
  if (frame.kind === "error") return { kind: "error", ...parseFailure(frame) };
  if (frame.kind === "response") {
    const id = boundedString(frame.id, "response id", 128);
    if (frame.ok === true) return { kind: "response", id, ok: true, result: parseResult(frame.result) };
    if (frame.ok === false) return { kind: "response", id, ok: false, error: parseFailure(frame.error) };
    throw new ProtocolError("Invalid command response.");
  }
  throw new ProtocolError("Unknown server frame.");
}

export function encodeFrame(frame: ClientFrame | ServerFrame): string {
  return JSON.stringify(frame);
}
