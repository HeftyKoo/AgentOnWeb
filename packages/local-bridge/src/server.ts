import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  PROTOCOL_VERSION,
  type ClientHello,
  type ClientRequest,
  type RuntimeCommand,
  type RuntimeCommandResult,
  type ServerFrame,
} from "@overcode/shared-protocol";
import { AuthorizationError, PairingAuthority } from "./credentials.js";
import type { HarnessSurfaceProvider } from "./harness-surface.js";

const AUTH_TIMEOUT_MS = 5_000;
const MAX_PAYLOAD_BYTES = 1_048_576;

export interface BridgeServerOptions {
  readonly surface: HarnessSurfaceProvider;
  readonly authority: PairingAuthority;
  readonly port?: number;
}

export interface RunningBridge {
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly close: () => Promise<void>;
}

export async function startBridge(options: BridgeServerOptions): Promise<RunningBridge> {
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: options.port ?? 3847,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  const authenticated = new Set<WebSocket>();

  server.on("connection", (socket, request) => {
    const origin = request.headers.origin;
    let authorized = false;
    const timeout = setTimeout(() => socket.close(4408, "Authentication timeout"), AUTH_TIMEOUT_MS);

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        socket.close(4400, "Binary frames are not supported");
        return;
      }
      void handleMessage(data, socket, origin, authorized, options).then((didAuthorize) => {
        if (didAuthorize && !authorized) {
          authorized = true;
          authenticated.add(socket);
          clearTimeout(timeout);
        }
      }).catch((error: unknown) => {
        if (error instanceof AuthorizationError) {
          send(socket, { kind: "error", code: error.code, message: error.message });
          socket.close(4401, error.code);
          return;
        }
        const message = error instanceof Error ? error.message : "Bridge request failed.";
        send(socket, { kind: "error", code: "BRIDGE_ERROR", message });
      });
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      authenticated.delete(socket);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;

  return {
    host: "127.0.0.1",
    port: address.port,
    close: async () => {
      for (const socket of server.clients) socket.close(1001, "Bridge shutting down");
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function handleMessage(
  raw: RawData,
  socket: WebSocket,
  origin: string | undefined,
  authorized: boolean,
  options: BridgeServerOptions,
): Promise<boolean> {
  const parsed = parseJson(raw);
  if (!authorized) {
    const hello = assertHello(parsed);
    const result = await options.authority.authorize(origin, {
      ...(hello.credential ? { credential: hello.credential } : {}),
      ...(hello.pairingCode ? { pairingCode: hello.pairingCode } : {}),
    });
    send(socket, {
      kind: "hello",
      protocolVersion: PROTOCOL_VERSION,
      connectionId: randomUUID(),
      paired: result.paired,
      ...(result.credential ? { credential: result.credential } : {}),
    });
    return true;
  }

  const request = assertRequest(parsed);
  try {
    const result = await dispatch(options.surface, request.command);
    send(socket, { kind: "response", id: request.id, ok: true, result });
  } catch (error) {
    send(socket, {
      kind: "response",
      id: request.id,
      ok: false,
      error: {
        code: "RUNTIME_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "Runtime request failed.",
      },
    });
  }
  return false;
}

async function dispatch(surface: HarnessSurfaceProvider, command: RuntimeCommand): Promise<RuntimeCommandResult> {
  switch (command.type) {
    case "surface.get":
      return surface.getSurface();
    case "connection.ping":
      return { ok: true };
  }
}

function parseJson(raw: RawData): unknown {
  const text = Array.isArray(raw)
    ? Buffer.concat(raw).toString("utf8")
    : raw instanceof ArrayBuffer
      ? Buffer.from(raw).toString("utf8")
      : Buffer.from(raw).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AuthorizationError("INVALID_FRAME", "The bridge received invalid JSON.");
  }
}

function assertHello(value: unknown): ClientHello {
  if (!isRecord(value)
    || value.kind !== "hello"
    || value.protocolVersion !== PROTOCOL_VERSION
    || typeof value.clientNonce !== "string"
    || value.clientNonce.length < 8
    || (value.credential !== undefined && typeof value.credential !== "string")
    || (value.pairingCode !== undefined && typeof value.pairingCode !== "string")) {
    throw new AuthorizationError("INVALID_HELLO", "Invalid bridge handshake.");
  }
  return value as unknown as ClientHello;
}

function assertRequest(value: unknown): ClientRequest {
  if (!isRecord(value)
    || value.kind !== "request"
    || typeof value.id !== "string"
    || value.id.length > 128
    || !isRecord(value.command)
    || typeof value.command.type !== "string") {
    throw new Error("Invalid bridge request.");
  }
  return value as unknown as ClientRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}
