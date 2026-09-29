import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@agentonweb/connector-contract";
import { ConnectorClient, discoverRuntimes, isLocalSurfaceUrl, isNativeSurface, isRuntimeDescriptor } from "./connector-client.js";
import { isContentRequest } from "./shared.js";
describe("native surface trust", () => {
  it("opts in to session updates only when the client consumes them", () => {
    const sent: unknown[] = [];
    let socket: TestSocket;
    class TestSocket {
      onopen?: () => void;
      constructor() { socket = this; }
      send(value: string) { sent.push(JSON.parse(value)); }
      close() {}
    }
    vi.stubGlobal("WebSocket", TestSocket);
    const callbacks = { pending: vi.fn(), ready: vi.fn(), closed: vi.fn(), rejected: vi.fn() };
    const subscriber = new ConnectorClient({ ...callbacks, sessions: vi.fn() });
    const base = new ConnectorClient(callbacks);
    try {
      subscriber.connect("ws://127.0.0.1:3847", "credential"); socket!.onopen!();
      base.connect("ws://127.0.0.1:3847", "credential"); socket!.onopen!();
      expect(sent[0]).toEqual({ kind: "hello", protocolVersion: PROTOCOL_VERSION, credential: "credential", agentSessions: true });
      expect(sent[1]).not.toHaveProperty("agentSessions");
    } finally { subscriber.close(); base.close(); vi.unstubAllGlobals(); }
  });
  it("requires an explicit surface contract and declared capabilities", () => {
    expect(isRuntimeDescriptor({ id: "example", displayName: "Example", surfaceKind: "web", capabilities: { translucency: false, optionTap: false } })).toBe(true);
    expect(isRuntimeDescriptor({ id: "example", displayName: "Example", surfaceKind: "web" })).toBe(false);
    expect(isRuntimeDescriptor({ id: "../bad", displayName: "Example", surfaceKind: "web", capabilities: { translucency: true, optionTap: true } })).toBe(false);
  });
  it("only accepts clean loopback HTTP surfaces", () => {
    expect(isLocalSurfaceUrl("http://localhost:3000/")).toBe(true);
    for (const url of ["https://example.org/", "http://localhost:3000/?token=secret", "http://user@localhost:3000/", "http://localhost:3000/other", "file:///tmp/test"]) expect(isLocalSurfaceUrl(url)).toBe(false);
    expect(isNativeSurface({ ok: true })).toBe(false);
    for (const value of [null, undefined, [], 42, "surface", { cookie: null }]) expect(isNativeSurface(value)).toBe(false);
  });
  it("accepts only the current privileged content-message contract", () => {
    expect(isContentRequest({ source: "agentonweb-content", type: "runtime.connect" })).toBe(true);
    for (const payload of [{ type: "unknown" }, { type: "mode.set", mode: "evil" }, { type: "opacity.set", opacity: NaN }, { type: "runtime.connect", runtimeId: {} }]) expect(isContentRequest({ source: "agentonweb-content", ...payload })).toBe(false);
  });
  it("preflights loopback ports before creating WebSockets", async () => {
    const opened: string[] = [];
    class TestSocket {
      static readonly OPEN = 1;
      readyState = 0;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      constructor(readonly url: string) {
        opened.push(url);
        queueMicrotask(() => { this.readyState = TestSocket.OPEN; this.onopen?.(); });
      }
      send(): void {
        this.onmessage?.({ data: JSON.stringify({
          kind: "available",
          protocolVersion: PROTOCOL_VERSION,
          runtime: { id: "deepseek-harness", displayName: "DeepSeek Harness", surfaceKind: "web", capabilities: { translucency: true, optionTap: true } },
          approvalUrl: "http://127.0.0.1:3080/",
        }) });
      }
      close(): void { this.readyState = 3; }
    }
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "http://127.0.0.1:3849/") return new Response(null, { status: 426 });
      throw new TypeError("Connection refused");
    }));
    vi.stubGlobal("WebSocket", TestSocket);
    try {
      await expect(discoverRuntimes()).resolves.toEqual([expect.objectContaining({ endpoint: "ws://127.0.0.1:3849" })]);
      expect(opened).toEqual(["ws://127.0.0.1:3849"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
