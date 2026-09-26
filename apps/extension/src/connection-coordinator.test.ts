import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@agentonweb/connector-contract";
import { ConnectionCoordinator } from "./connection-coordinator.js";
import type { ConnectorCallbacks } from "./connector-client.js";

const runtime = {
  id: "native-test",
  displayName: "Native test",
  surfaceKind: "web" as const,
  capabilities: { translucency: true, optionTap: true },
};
const available = {
  kind: "available" as const,
  protocolVersion: PROTOCOL_VERSION,
  runtime,
  endpoint: "ws://127.0.0.1:3847",
  approvalUrl: "http://127.0.0.1:3080/",
};
const surface = {
  runtimeId: runtime.id,
  displayName: runtime.displayName,
  url: "http://localhost:3080/",
  cookie: { name: "session", value: "private", maxAgeSeconds: 60 },
};

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it("retries a disconnected authorized runtime after 3 seconds, backs off while offline, and stops after revocation", async () => {
  vi.useFakeTimers();
  const callbacks: ConnectorCallbacks[] = [];
  const discover = vi.fn(async () => [available]);
  const coordinator = new ConnectionCoordinator({
    discover,
    createTransport(next) { callbacks.push(next); return { connect() {}, close() {}, request: async () => surface }; },
    effects: { changed() {}, saveCredentials: async () => {}, openApproval: async () => {}, revokeDelegation: async () => {} },
  });
  await coordinator.connect(); callbacks[0]!.ready('credential'); await coordinator.idle();
  callbacks[0]!.closed(); await coordinator.idle();
  discover.mockResolvedValue([]);
  await vi.advanceTimersByTimeAsync(2999); expect(discover).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await coordinator.idle(); expect(discover).toHaveBeenCalledTimes(2);
  discover.mockResolvedValue([available]);
  await vi.advanceTimersByTimeAsync(5999); expect(discover).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1); await coordinator.idle(); expect(callbacks).toHaveLength(2);
  callbacks[1]!.ready(); await coordinator.idle();
  await vi.advanceTimersByTimeAsync(30_000); expect(discover).toHaveBeenCalledTimes(3);
  callbacks[1]!.closed(); await coordinator.idle();
  callbacks[1]!.rejected('REVOKED', 'Revoked'); await coordinator.idle();
  await vi.advanceTimersByTimeAsync(30_000); expect(discover).toHaveBeenCalledTimes(3);
});

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
      effects: {
        changed,
        saveCredentials,
        openApproval: vi.fn(async () => {}),
        revokeDelegation: vi.fn(async () => {}),
      },
    });
    await coordinator.connect();
    expect(connect).toHaveBeenCalledWith(available.endpoint, undefined);
    callbacks.ready("installation-credential");
    await coordinator.idle();
    expect(saveCredentials).toHaveBeenCalledWith({
      [runtime.id]: "installation-credential",
    });
    expect(coordinator.snapshot).toMatchObject({
      view: { connection: "connected", runtimeId: runtime.id },
      surface,
    });
    expect(changed).toHaveBeenCalled();
  });

  it("serializes overlapping connection commands", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
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
      createTransport: () => ({
        connect: vi.fn(),
        close: vi.fn(),
        request: vi.fn(async () => surface),
      }),
      effects: {
        changed: vi.fn(),
        saveCredentials: vi.fn(async () => {}),
        openApproval: vi.fn(async () => {}),
        revokeDelegation: vi.fn(async () => {}),
      },
    });
    const one = coordinator.connect();
    const two = coordinator.connect(runtime.id);
    await Promise.resolve();
    release();
    await Promise.all([one, two]);
    expect(discover).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
  });

  it("exposes discovered management origins before pairing independently of the selected runtime", async () => {
    const second = {
      ...available,
      runtime: { ...runtime, id: "terminal", displayName: "Local terminal" },
      endpoint: "ws://127.0.0.1:3848",
      approvalUrl: "http://localhost:49827/",
    };
    const discover = vi.fn(async () => [available, second]);
    let callbacks!: ConnectorCallbacks;
    const coordinator = new ConnectionCoordinator({
      discover,
      createTransport(next) {
        callbacks = next;
        return {
          connect: vi.fn(),
          close: vi.fn(),
          request: async () => surface,
        };
      },
      effects: {
        changed: vi.fn(),
        saveCredentials: vi.fn(async () => {}),
        openApproval: vi.fn(async () => {}),
        revokeDelegation: vi.fn(async () => {}),
      },
    });
    await coordinator.connect(runtime.id);
    expect(coordinator.snapshot.view.nativeOrigins).toContain("http://localhost:49827");
    expect(coordinator.snapshots.has("terminal")).toBe(false);
    callbacks.ready("installation-credential");
    await coordinator.idle();
    expect(coordinator.snapshot.view).toMatchObject({
      runtimeId: runtime.id,
      connection: "connected",
    });
    expect(coordinator.snapshot.view.nativeOrigins).toEqual(
      expect.arrayContaining(["http://127.0.0.1:3080", "http://localhost:3080", "http://localhost:49827"]),
    );
    discover.mockResolvedValue([available]);
    await coordinator.connect();
    expect(coordinator.snapshot.view.nativeOrigins).not.toContain("http://localhost:49827");
  });

  it("forgets a revoked runtime after discovery loses it and ignores its old callbacks after reappearance", async () => {
    const discover = vi.fn(async () => [available]);
    const callbacks: ConnectorCallbacks[] = [];
    const close = vi.fn();
    const saveCredentials = vi.fn(async () => {});
    const coordinator = new ConnectionCoordinator({
      discover,
      createTransport(next) {
        callbacks.push(next);
        return { connect: vi.fn(), close, request: async () => surface };
      },
      effects: {
        changed: vi.fn(),
        saveCredentials,
        openApproval: vi.fn(async () => {}),
        revokeDelegation: vi.fn(async () => {}),
      },
    });
    await coordinator.connect();
    callbacks[0]!.ready("old-credential");
    await coordinator.idle();
    callbacks[0]!.rejected("REVOKED", "Connection revoked.");
    callbacks[0]!.closed();
    await coordinator.idle();
    discover.mockResolvedValue([]);
    await coordinator.connect();
    expect(coordinator.snapshots.size).toBe(0);
    expect(coordinator.snapshot.view).toMatchObject({
      connection: "disconnected",
      runtimes: [],
      nativeOrigins: [],
    });
    expect(coordinator.snapshot.view.runtimeId).toBeUndefined();
    expect(coordinator.snapshot.view.error).toContain("aow service install");
    expect(close).toHaveBeenCalledOnce();
    callbacks[0]!.ready("stale-credential");
    callbacks[0]!.pending(available.approvalUrl);
    await coordinator.idle();
    expect(coordinator.snapshots.size).toBe(0);

    discover.mockResolvedValue([available]);
    await coordinator.connect();
    callbacks[1]!.ready("fresh-credential");
    await coordinator.idle();
    callbacks[0]!.rejected("REVOKED", "Old rejection.");
    callbacks[0]!.closed();
    callbacks[0]!.ready("stale-credential");
    await coordinator.idle();
    expect(coordinator.snapshot).toMatchObject({
      view: { connection: "connected", runtimeId: runtime.id },
      surface,
    });
    expect(saveCredentials).toHaveBeenLastCalledWith({
      [runtime.id]: "fresh-credential",
    });
  });

  it("restores an authorized selection when the saved selection has been removed", async () => {
    const second = {
      ...available,
      runtime: { ...runtime, id: "terminal", displayName: "Local terminal" },
      endpoint: "ws://127.0.0.1:3848",
      approvalUrl: "http://localhost:49827/",
    };
    const callbacks: ConnectorCallbacks[] = [];
    const connect = vi.fn();
    const openApproval = vi.fn(async () => {});
    const coordinator = new ConnectionCoordinator({
      discover: async () => [available, second],
      createTransport(next) {
        const target =
          callbacks.length === 0 ? surface : { ...surface, runtimeId: "terminal", url: second.approvalUrl };
        callbacks.push(next);
        return { connect, close: vi.fn(), request: async () => target };
      },
      effects: {
        changed: vi.fn(),
        saveCredentials: vi.fn(async () => {}),
        openApproval,
        revokeDelegation: vi.fn(async () => {}),
      },
    });
    await coordinator.restore("removed-acceptance-runtime", {
      [runtime.id]: "saved-native",
      terminal: "saved-terminal",
    });
    callbacks[0]!.ready();
    callbacks[1]!.ready();
    await coordinator.idle();
    expect(coordinator.snapshot).toMatchObject({
      view: { connection: "connected", runtimeId: runtime.id },
      surface,
    });
    expect(connect.mock.calls).toEqual([
      [available.endpoint, "saved-native"],
      [second.endpoint, "saved-terminal"],
    ]);
    expect(openApproval).not.toHaveBeenCalled();
  });

  it.each(["connected", "reconnecting", "disconnected"] as const)(
    "retains a %s runtime when discovery temporarily misses it",
    async (connection) => {
      const discover = vi.fn(async () => [available]);
      let callbacks!: ConnectorCallbacks;
      const close = vi.fn();
      const coordinator = new ConnectionCoordinator({
        discover,
        createTransport(next) {
          callbacks = next;
          return { connect: vi.fn(), close, request: async () => surface };
        },
        effects: {
          changed: vi.fn(),
          saveCredentials: vi.fn(async () => {}),
          openApproval: vi.fn(async () => {}),
          revokeDelegation: vi.fn(async () => {}),
        },
      });
      await coordinator.connect();
      callbacks.ready(connection === "connected" ? undefined : "saved-credential");
      await coordinator.idle();
      if (connection === "reconnecting") callbacks.closed();
      if (connection === "disconnected") callbacks.rejected("TEMPORARY_ERROR", "Try again.");
      await coordinator.idle();
      discover.mockResolvedValue([]);
      await coordinator.connect();
      expect(coordinator.snapshots.get(runtime.id)?.view.connection).toBe(connection);
      expect(coordinator.snapshot.view.runtimes).toContainEqual({
        id: runtime.id,
        displayName: runtime.displayName,
      });
      expect(close).not.toHaveBeenCalled();
    },
  );

  it("keeps both runtime transports and surfaces alive when switching, and isolates rejection", async () => {
    const second = {
      ...available,
      runtime: { ...runtime, id: "terminal", displayName: "Local terminal" },
      endpoint: "ws://127.0.0.1:3848",
    };
    const callbacks: ConnectorCallbacks[] = [];
    const transports: {
      close: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
    }[] = [];
    const coordinator = new ConnectionCoordinator({
      discover: async () => [available, second],
      createTransport(cb) {
        const index = callbacks.length;
        callbacks.push(cb);
        const transport = {
          close: vi.fn(),
          connect: vi.fn(),
          request: async () => ({
            ...surface,
            runtimeId: index === 0 ? runtime.id : "terminal",
          }),
        };
        transports.push(transport);
        return transport;
      },
      effects: {
        changed: vi.fn(),
        saveCredentials: vi.fn(async () => {}),
        openApproval: vi.fn(async () => {}),
        revokeDelegation: vi.fn(async () => {}),
      },
    });
    await coordinator.connect(runtime.id);
    callbacks[0]!.ready("one");
    await coordinator.idle();
    await coordinator.connect("terminal");
    callbacks[1]!.ready("two");
    await coordinator.idle();
    await coordinator.activate(runtime.id);
    expect(coordinator.snapshots.size).toBe(2);
    expect([...coordinator.snapshots.values()].every((item) => item.surface)).toBe(true);
    expect(transports[0]!.close).not.toHaveBeenCalled();
    expect(transports[1]!.close).not.toHaveBeenCalled();
    callbacks[1]!.rejected("REVOKED", "revoked");
    await coordinator.idle();
    expect(coordinator.snapshot.surface?.runtimeId).toBe(runtime.id);
    expect(coordinator.snapshots.get("terminal")?.surface).toBeUndefined();
  });
});

it("aggregates semantic sessions independently of selection and removes them on disconnect", async () => {
  let callbacks!: ConnectorCallbacks;
  const coordinator = new ConnectionCoordinator({
    discover: async () => [available],
    createTransport(next) { callbacks = next; return { connect() {}, close() {}, request: async () => surface }; },
    effects: { changed() {}, saveCredentials: async () => {}, openApproval: async () => {}, revokeDelegation: async () => {} },
  });
  await coordinator.connect(); callbacks.ready("credential"); await coordinator.idle();
  const item = { id: "session", runtimeId: runtime.id, terminalId: "one", agent: "Codex", title: "Private prompt", detail: "", status: "running" as const, updatedAt: 1, attentionId: "" };
  callbacks.sessions?.([item, { ...item, runtimeId: "foreign" }]); await coordinator.idle();
  expect(coordinator.snapshot.view.agentSessions).toEqual([item]);
  callbacks.closed(); await coordinator.idle();
  expect(coordinator.snapshot.view.agentSessions).toEqual([]);
});
