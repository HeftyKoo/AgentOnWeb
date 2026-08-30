import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ServerFrame } from "@overcode/shared-protocol";
import { PairingAuthority } from "./credentials.js";
import type { HarnessSurfaceProvider } from "./harness-surface.js";
import { startBridge, type RunningBridge } from "./server.js";

const directories: string[] = [];
const bridges: RunningBridge[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("authenticated local bridge", () => {
  it("pairs a Chromium extension and requires its credential on reconnect", async () => {
    const directory = await mkdtemp(join(tmpdir(), "overcode-bridge-"));
    directories.push(directory);
    const authority = await PairingAuthority.open(directory);
    const bridge = await startBridge({
      surface: new FakeSurface(),
      authority,
      port: 0,
    });
    bridges.push(bridge);
    const origin = `chrome-extension://${"c".repeat(32)}`;

    const first = new WebSocket(`ws://${bridge.host}:${bridge.port}`, { headers: { Origin: origin } });
    await once(first, "open");
    first.send(JSON.stringify({
      kind: "hello",
      protocolVersion: PROTOCOL_VERSION,
      clientNonce: "nonce-first",
      pairingCode: authority.pairingCode,
    }));
    const hello = await nextFrame(first);
    expect(hello.kind).toBe("hello");
    const credential = hello.kind === "hello" ? hello.credential : undefined;
    expect(credential).toBeTruthy();
    first.close();
    await once(first, "close");

    const second = new WebSocket(`ws://${bridge.host}:${bridge.port}`, { headers: { Origin: origin } });
    await once(second, "open");
    second.send(JSON.stringify({
      kind: "hello",
      protocolVersion: PROTOCOL_VERSION,
      clientNonce: "nonce-second",
      credential,
    }));
    expect((await nextFrame(second)).kind).toBe("hello");
    second.send(JSON.stringify({
      kind: "request",
      id: "request-1",
      command: { type: "surface.get" },
    }));
    const response = await nextFrame(second);
    expect(response).toMatchObject({
      kind: "response",
      id: "request-1",
      ok: true,
      result: { runtimeId: "deepseek-harness", url: "http://localhost:3080/" },
    });
    second.close();
  });
});

async function nextFrame(socket: WebSocket): Promise<ServerFrame> {
  const [data] = await once(socket, "message") as [WebSocket.RawData];
  return JSON.parse(data.toString()) as ServerFrame;
}

class FakeSurface implements HarnessSurfaceProvider {
  getSurface() {
    return Promise.resolve({
      runtimeId: "deepseek-harness",
      displayName: "DeepSeek Harness",
      url: "http://localhost:3080/",
      cookie: { name: "dsh-auth-test", value: "signed", maxAgeSeconds: 60 },
    });
  }
}
