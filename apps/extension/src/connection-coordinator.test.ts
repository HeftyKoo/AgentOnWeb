import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@agentonweb/connector-contract";
import { ConnectionCoordinator } from "./connection-coordinator.js";
import type { ConnectorCallbacks } from "./connector-client.js";

const runtime = { id: "native-test", displayName: "Native test", surfaceKind: "web" as const,
  capabilities: { translucency: true, optionTap: true } };
const available = { kind: "available" as const, protocolVersion: PROTOCOL_VERSION, runtime,
  endpoint: "ws://127.0.0.1:3847", approvalUrl: "http://127.0.0.1:3080/" };
const surface = { runtimeId: runtime.id, displayName: runtime.displayName, url: "http://localhost:3080/",
  cookie: { name: "session", value: "private", maxAgeSeconds: 60 } };

describe("ConnectionCoordinator", () => {
  it("owns pairing, credential persistence and surface acquisition behind its Interface", async () => {
    let callbacks!: ConnectorCallbacks;
    const connect = vi.fn();
    const saveCredentials = vi.fn(async () => {});
    const changed = vi.fn();
    const coordinator = new ConnectionCoordinator({
      discover: vi.fn(async () => [available]),
      createTransport(next) {
        callbacks = next;
        return { connect, close: vi.fn(), request: vi.fn(async () => surface) };
      },
      effects: { changed, saveCredentials, openApproval: vi.fn(async () => {}), revokeDelegation: vi.fn(async () => {}) },
    });
    await coordinator.connect();
    expect(connect).toHaveBeenCalledWith(available.endpoint, undefined);
    callbacks.ready("installation-credential");
    await coordinator.idle();
    expect(saveCredentials).toHaveBeenCalledWith({ [runtime.id]: "installation-credential" });
    expect(coordinator.snapshot).toMatchObject({ view: { connection: "connected", runtimeId: runtime.id }, surface });
    expect(changed).toHaveBeenCalled();
  });

  it("serializes overlapping connection commands", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let maximum = 0;
    const discover = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      if (discover.mock.calls.length === 1) await first;
      active--;
      return [available];
    });
    const coordinator = new ConnectionCoordinator({
      discover,
      createTransport: () => ({ connect: vi.fn(), close: vi.fn(), request: vi.fn(async () => surface) }),
      effects: { changed: vi.fn(), saveCredentials: vi.fn(async () => {}), openApproval: vi.fn(async () => {}), revokeDelegation: vi.fn(async () => {}) },
    });
    const one = coordinator.connect();
    const two = coordinator.connect(runtime.id);
    await Promise.resolve();
    release();
    await Promise.all([one, two]);
    expect(discover).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
  });
});
