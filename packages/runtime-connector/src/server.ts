import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import { CONNECTOR_PORTS, PROTOCOL_VERSION, type SurfaceAdapter, type ServerFrame } from "@overcode/shared-protocol";
import { Authorization, AuthorizationError, EXTENSION_ORIGIN } from "./authorization.js";
export { Authorization } from "./authorization.js";

export interface Connector { port: number; close(): Promise<void> }

/** Runs inside a runtime plugin, never starts or supervises the runtime itself. */
export async function startConnector(adapter: SurfaceAdapter, authority: Authorization, ports: readonly number[] = CONNECTOR_PORTS): Promise<Connector> {
  for (const port of ports) {
    try { return await listen(port, adapter, authority); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error; }
  }
  throw new Error("All Overcode connector ports are busy. Close an unused runtime and retry.");
}

async function listen(port: number, adapter: SurfaceAdapter, authority: Authorization): Promise<Connector> {
  const server = new WebSocketServer({ host: "127.0.0.1", port, maxPayload: 16_384, perMessageDeflate: false });
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const grants = new Map<WebSocket, string>();
  const off = authority.onRevoke((id) => {
    for (const [socket, grant] of grants) if (id === grant) {
      send(socket, { kind: "error", code: "REVOKED", message: "Connection authorization was revoked in the runtime." });
      socket.close(4401, "REVOKED");
    }
  });
  server.on("error", () => {});
  server.on("connection", (socket, req) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    const actualPort = (server.address() as AddressInfo).port;
    if (!origin || !EXTENSION_ORIGIN.test(origin) || host !== `127.0.0.1:${actualPort}` || req.url !== "/") {
      socket.close(4403, "Untrusted connection"); return;
    }
    let phase: "hello" | "pending" | "ready" | "closed" = "hello";
    let cancel = () => {};
    let credential: string | undefined;
    let pendingHeartbeat: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => socket.close(4408, "Handshake timeout"), 5_000);
    const fail = (error: unknown) => {
      if (phase === "closed") return;
      const code = error instanceof AuthorizationError ? error.code : "REQUEST_FAILED";
      send(socket, { kind: "error", code, message: error instanceof Error ? error.message : "Request failed." });
      socket.close(4401, code);
    };
    socket.on("error", () => {});
    socket.on("close", () => { phase = "closed"; clearTimeout(timeout); clearInterval(pendingHeartbeat); cancel(); grants.delete(socket); });
    socket.on("message", (raw, binary) => {
      void (async () => {
        if (binary) throw new Error("Binary frames are not supported.");
        const frame: unknown = JSON.parse(raw.toString());
        if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new Error("Invalid frame.");
        const f = frame as Record<string, unknown>;
        if (phase === "hello") {
          if (f.kind !== "hello" || f.protocolVersion !== PROTOCOL_VERSION || typeof f.clientNonce !== "string" || f.clientNonce.length < 8) throw new Error("Incompatible connector handshake.");
          phase = "pending";
          clearTimeout(timeout);
          if (f.intent === "discover") {
            send(socket, { kind: "available", protocolVersion: PROTOCOL_VERSION, runtime: adapter.runtime, approvalUrl: adapter.approvalUrl });
            socket.close(1000, "Discovery complete"); return;
          }
          let grantId: string;
          if (typeof f.credential === "string") {
            credential = f.credential;
            grantId = authority.authenticate(origin, credential);
          } else if (f.intent === "pair") {
            const pending = authority.request(origin);
            cancel = pending.cancel;
            send(socket, { kind: "pending", requestId: pending.request.id, expiresAt: pending.request.expiresAt, approvalUrl: adapter.approvalUrl });
            pendingHeartbeat = setInterval(() => send(socket, { kind: "pending", requestId: pending.request.id, expiresAt: pending.request.expiresAt, approvalUrl: adapter.approvalUrl }), 20_000);
            const result = await pending.result;
            clearInterval(pendingHeartbeat);
            if (socket.readyState !== WebSocket.OPEN) { await authority.revoke(result.id); return; }
            grantId = result.id;
            credential = result.credential;
          } else throw new AuthorizationError("APPROVAL_REQUIRED", "Request approval in the native runtime first.");
          grants.set(socket, grantId);
          phase = "ready";
          send(socket, { kind: "hello", protocolVersion: PROTOCOL_VERSION, connectionId: randomUUID(), paired: true, runtime: adapter.runtime,
            ...(f.intent === "pair" && credential ? { credential } : {}) });
          return;
        }
        if (phase !== "ready" || !credential) throw new Error("Wait for native runtime approval.");
        authority.authenticate(origin, credential);
        if (f.kind !== "request" || typeof f.id !== "string" || f.id.length > 128 || !f.command || typeof f.command !== "object") throw new Error("Invalid request.");
        const type = (f.command as { type?: unknown }).type;
        if (type !== "surface.get" && type !== "connection.ping") throw new Error("Unknown connector command.");
        const result = type === "surface.get" ? await adapter.getSurface() : { ok: true as const };
        // An authorization revoked during an asynchronous adapter call must not leak a surface.
        authority.authenticate(origin, credential);
        send(socket, { kind: "response", id: f.id, ok: true, result });
      })().catch(fail);
    });
  });
  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      off(); authority.close();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}
