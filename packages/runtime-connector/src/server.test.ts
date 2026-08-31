import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type ServerFrame, type SurfaceAdapter } from "@overcode/shared-protocol";
import { Authorization, startConnector, type Connector } from "./server.js";
const directories: string[] = [];
const servers: Connector[] = [];
const sockets: WebSocket[] = [];
const origin = `chrome-extension://${"c".repeat(32)}`;
const adapter: SurfaceAdapter = {
  runtime: { id: "test-native-runtime", displayName: "Test native runtime", surfaceKind: "web", capabilities: { translucency: false, optionTap: false } },
  approvalUrl: "http://127.0.0.1:3080/",
  getSurface: vi.fn(async () => ({ runtimeId: "test-native-runtime", displayName: "Test native runtime", url: "http://localhost:3080/", cookie: { name: "native-test", value: "private-cookie", maxAgeSeconds: 60 } })),
};
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "overcode-connector-")); directories.push(dir);
  const authority = await Authorization.open(dir);
  const server = await startConnector(adapter, authority, [0]); servers.push(server);
  return { authority, server };
}
async function connect(server: Connector, headers = { Origin: origin }) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers }); sockets.push(socket);
  await once(socket, "open"); return socket;
}
function hello(socket: WebSocket, extras: Record<string, unknown>) {
  socket.send(JSON.stringify({ kind: "hello", protocolVersion: PROTOCOL_VERSION, clientNonce: "test-client-nonce", ...extras }));
}
async function frame(socket: WebSocket): Promise<ServerFrame> { const [data] = await once(socket, "message"); return JSON.parse(String(data)) as ServerFrame; }
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.clearAllMocks();
});

describe("runtime-independent connector", () => {
  it("discovers without creating approval requests or revealing credentials", async () => {
    const { server, authority } = await setup(); const socket = await connect(server);
    hello(socket, { intent: "discover" });
    const result = await frame(socket);
    expect(result).toMatchObject({ kind: "available", runtime: { id: "test-native-runtime" } });
    expect(JSON.stringify(result)).not.toContain("private-cookie");
    expect(authority.snapshot()).toEqual({ pending: [], grants: [] });
    expect(adapter.getSurface).not.toHaveBeenCalled();
  });
  it("requires approval, reconnects with the bound credential, and closes revoked connections", async () => {
    const { server, authority } = await setup(); const first = await connect(server);
    hello(first, { intent: "pair" }); const pending = await frame(first);
    expect(pending.kind).toBe("pending");
    if (pending.kind !== "pending") throw new Error("Expected pending");
    const authorized = frame(first);
    await authority.decide(pending.requestId, true);
    const accepted = await authorized;
    if (accepted.kind !== "hello" || !accepted.credential) throw new Error("Expected credential");
    const second = await connect(server); hello(second, { credential: accepted.credential });
    expect(await frame(second)).toMatchObject({ kind: "hello", paired: true });
    second.send(JSON.stringify({ kind: "request", id: "surface", command: { type: "surface.get" } }));
    expect(await frame(second)).toMatchObject({ kind: "response", result: { runtimeId: "test-native-runtime", cookie: { value: "private-cookie" } } });
    const revoked = frame(second);
    await authority.revoke(authority.snapshot().grants[0]!.id);
    expect(await revoked).toMatchObject({ kind: "error", code: "REVOKED" });
    const third = await connect(server); hello(third, { credential: accepted.credential });
    expect(await frame(third)).toMatchObject({ kind: "error", code: "AUTHENTICATION_FAILED" });
  });
  it("never serves a surface before approval, including pipelined requests", async () => {
    const { server, authority } = await setup(); const socket = await connect(server);
    hello(socket, { intent: "pair" }); expect((await frame(socket)).kind).toBe("pending");
    socket.send(JSON.stringify({ kind: "request", id: "surface", command: { type: "surface.get" } }));
    expect(await frame(socket)).toMatchObject({ kind: "error" });
    expect(adapter.getSurface).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(authority.snapshot().pending).toHaveLength(0));
  });
  it("rejects arbitrary website origins and unsupported protocol versions", async () => {
    const { server } = await setup();
    const website = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers: { Origin: "https://example.org" } }); sockets.push(website);
    expect((await once(website, "close"))[0]).toBe(4403);
    const socket = await connect(server);
    hello(socket, { protocolVersion: 2, intent: "pair" });
    expect(await frame(socket)).toMatchObject({ kind: "error" });
  });
  it("declines requests without issuing a credential", async () => {
    const { server, authority } = await setup(); const socket = await connect(server);
    hello(socket, { intent: "pair" }); const pending = await frame(socket);
    if (pending.kind !== "pending") throw new Error("Expected pending");
    const denied = frame(socket); await authority.decide(pending.requestId, false);
    expect(await denied).toMatchObject({ kind: "error", code: "DENIED" });
    expect(authority.snapshot().grants).toHaveLength(0);
  });
  it("does not deliver an in-flight surface after its grant is revoked", async () => {
    const { server, authority } = await setup(); const socket = await connect(server);
    hello(socket, { intent: "pair" }); const pending = await frame(socket);
    if (pending.kind !== "pending") throw new Error("Expected pending");
    const accepted = frame(socket); await authority.decide(pending.requestId, true); await accepted;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(adapter.getSurface).mockImplementationOnce(async () => {
      await waiting;
      return { runtimeId: adapter.runtime.id, displayName: adapter.runtime.displayName, url: "http://localhost:3080/",
        cookie: { name: "native-test", value: "must-not-deliver", maxAgeSeconds: 60 } };
    });
    const received: ServerFrame[] = [];
    socket.on("message", (data) => received.push(JSON.parse(String(data)) as ServerFrame));
    socket.send(JSON.stringify({ kind: "request", id: "in-flight", command: { type: "surface.get" } }));
    await vi.waitFor(() => expect(adapter.getSurface).toHaveBeenCalledOnce());
    const closed = once(socket, "close");
    await authority.revoke(authority.snapshot().grants[0]!.id);
    release(); await closed;
    expect(received).toContainEqual(expect.objectContaining({ code: "REVOKED" }));
    expect(received.some((message) => message.kind === "response")).toBe(false);
  });
});
