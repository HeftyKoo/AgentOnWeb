import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, parseClientFrame, parseNativeSurface, parseServerFrame } from "./index.js";

describe("connector contract codec", () => {
  it("parses the complete supported handshake and request contract", () => {
    expect(parseClientFrame({ kind: "hello", protocolVersion: PROTOCOL_VERSION, intent: "discover" })).toEqual({
      kind: "hello", protocolVersion: PROTOCOL_VERSION, intent: "discover",
    });
    expect(parseClientFrame({ kind: "request", id: "1", command: { type: "surface.get" } })).toEqual({
      kind: "request", id: "1", command: { type: "surface.get" },
    });
  });

  it("rejects malformed and ambiguous untrusted frames", () => {
    for (const frame of [
      null,
      { kind: "hello", protocolVersion: PROTOCOL_VERSION + 1, intent: "pair" },
      { kind: "hello", protocolVersion: PROTOCOL_VERSION, intent: "pair", credential: "secret" },
      { kind: "request", id: "", command: { type: "surface.get" } },
      { kind: "request", id: "1", command: { type: "shell.exec" } },
    ]) expect(() => parseClientFrame(frame)).toThrow();
    expect(() => parseServerFrame({ kind: "pending", approvalUrl: "https://example.com/" })).toThrow();
  });

  it("validates native surfaces before credentials reach Chrome cookies", () => {
    const surface = { runtimeId: "dsh", displayName: "DSH", url: "http://localhost:3080/",
      cookie: { name: "session", value: "private", maxAgeSeconds: 60 } };
    expect(parseNativeSurface(surface)).toEqual(surface);
    expect(parseServerFrame({ kind: "response", id: "1", ok: true, result: surface })).toMatchObject({ result: surface });
    expect(() => parseNativeSurface({ ...surface, url: "https://remote.example/" })).toThrow();
  });
});
