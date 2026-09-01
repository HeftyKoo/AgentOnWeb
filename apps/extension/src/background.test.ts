import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@overcode/shared-protocol";
import { COOKIE_SCOPES_STORAGE_KEY, CREDENTIAL_STORAGE_KEY, STATE_STORAGE_KEY, type StateUpdate, type SurfaceCommand } from "./shared.js";

const transport = vi.hoisted(() => ({
  discover: vi.fn(), connect: vi.fn(), close: vi.fn(), request: vi.fn(),
  callbacks: undefined as undefined | {
    pending(url: string): void; ready(credential?: string): void;
    rejected(code: string, message: string): void; closed(): void;
  },
}));
vi.mock("./connector-client.js", async (original) => ({
  ...await original<typeof import("./connector-client.js")>(),
  discoverRuntimes: transport.discover,
  ConnectorClient: class {
    constructor(callbacks: NonNullable<typeof transport.callbacks>) { transport.callbacks = callbacks; }
    connect = transport.connect; close = transport.close; request = transport.request;
  },
}));

const runtime = { id: "native-test", displayName: "Native test", surfaceKind: "web", capabilities: { translucency: true, optionTap: true } };
const available = { kind: "available", protocolVersion: PROTOCOL_VERSION, runtime, endpoint: "ws://127.0.0.1:3847", approvalUrl: "http://127.0.0.1:3080/" };
const nativeSurface = { runtimeId: runtime.id, displayName: runtime.displayName, url: "http://localhost:3080/",
  cookie: { name: "native-session", value: "private-session-cookie", maxAgeSeconds: 60 } };
const tab = { id: 1, url: "https://example.org/", windowId: 1 };
let data: Record<string, unknown>;
let chromeMock: ReturnType<typeof createChrome>;

function event() { return { addListener: vi.fn() }; }
function createChrome() {
  return {
    runtime: { id: "extension-test", onMessage: event() },
    commands: { onCommand: event() }, action: { onClicked: event() },
    alarms: { create: vi.fn(async () => {}), onAlarm: event() },
    tabs: { query: vi.fn(async () => [tab]), sendMessage: vi.fn(async (_id: number, _message: StateUpdate | SurfaceCommand) => {}), onRemoved: event(),
      update: vi.fn(async () => {}), create: vi.fn(async () => {}) },
    windows: { update: vi.fn(async () => {}) },
    storage: { local: {
      setAccessLevel: vi.fn(async () => {}), get: vi.fn(async () => structuredClone(data)),
      set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }),
    } },
    cookies: {
      getPartitionKey: vi.fn(async () => ({ partitionKey: { topLevelSite: "https://example.org" } })),
      set: vi.fn(async () => ({ name: "native-session" })), remove: vi.fn(async () => ({})),
    },
  };
}
async function boot() {
  await import("./background.js");
  await vi.waitFor(() => expect(chromeMock.tabs.sendMessage).toHaveBeenCalled());
}
async function message(type: string, sender = { id: "extension-test", frameId: 0, tab }) {
  const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0]![0];
  return new Promise<any>((resolve) => {
    if (!listener({ source: "overcode-content", type }, sender, resolve)) resolve(undefined);
  });
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); data = {}; chromeMock = createChrome();
  vi.stubGlobal("chrome", chromeMock);
  transport.discover.mockResolvedValue([available]); transport.request.mockResolvedValue(nativeSurface);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("MV3 native connection lifecycle", () => {
  it("toggles only the clicked tab without switching modes or connecting", async () => {
    data = { [STATE_STORAGE_KEY]: { mode: "focus" } };
    await boot();
    chromeMock.tabs.sendMessage.mockClear();
    const onClick = chromeMock.action.onClicked.addListener.mock.calls[0]![0];
    onClick(tab);
    await vi.waitFor(() => expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(tab.id, {
      source: "overcode-background", type: "surface.toggle", state: expect.objectContaining({ mode: "focus" }),
    }));
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledOnce();
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.discover).not.toHaveBeenCalled();
  });

  it("mode shortcuts reveal only the active tab while preserving shared mode updates", async () => {
    const otherTab = { ...tab, id: 2, url: "https://example.net/" };
    chromeMock.tabs.query.mockResolvedValue([tab, otherTab]);
    await boot();
    chromeMock.tabs.sendMessage.mockClear();
    const onCommand = chromeMock.commands.onCommand.addListener.mock.calls[0]![0];
    onCommand("mode-watch", otherTab);
    await vi.waitFor(() => expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(otherTab.id, {
      source: "overcode-background", type: "surface.show", state: expect.objectContaining({ mode: "watch" }),
    }));
    const commands = chromeMock.tabs.sendMessage.mock.calls.filter(([, message]) => message.type !== "state.update");
    expect(commands).toHaveLength(1);
    expect(commands[0]![0]).toBe(otherTab.id);
    expect((await message("state.get")).result.mode).toBe("watch");
    expect(transport.connect).not.toHaveBeenCalled();
  });

  it("ignores toolbar actions on restricted browser pages", async () => {
    await boot(); chromeMock.tabs.sendMessage.mockClear();
    const onClick = chromeMock.action.onClicked.addListener.mock.calls[0]![0];
    onClick({ ...tab, url: "chrome://extensions/" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("requires explicit connection and keeps credentials out of content-script state", async () => {
    await boot(); expect(transport.connect).not.toHaveBeenCalled();
    expect(chromeMock.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    await message("runtime.connect"); expect(transport.connect).toHaveBeenCalledWith(available.endpoint, undefined);
    expect(data[CREDENTIAL_STORAGE_KEY]).toBeUndefined();
    transport.callbacks!.pending(available.approvalUrl);
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: available.approvalUrl }));
    transport.callbacks!.ready("private-installation-credential");
    await vi.waitFor(() => expect(chromeMock.cookies.set).toHaveBeenCalled());
    const response = await message("state.get");
    expect(response.result.surface).toMatchObject({ runtimeId: runtime.id, url: nativeSurface.url });
    expect(data[CREDENTIAL_STORAGE_KEY]).toEqual({ [runtime.id]: "private-installation-credential" });
    for (const exposed of [response, data[STATE_STORAGE_KEY], chromeMock.tabs.sendMessage.mock.calls]) {
      expect(JSON.stringify(exposed)).not.toContain("private-installation-credential");
      expect(JSON.stringify(exposed)).not.toContain("private-session-cookie");
    }
    expect(chromeMock.cookies.set).toHaveBeenCalledWith(expect.objectContaining({ httpOnly: true, secure: true, partitionKey: { topLevelSite: "https://example.org" } }));
  });

  it("cleans persisted cookie scopes after a cold start and revoked authorization", async () => {
    data = {
      [STATE_STORAGE_KEY]: { runtimeId: runtime.id, opacity: 0.23 },
      [CREDENTIAL_STORAGE_KEY]: { [runtime.id]: "saved-credential" },
      [COOKIE_SCOPES_STORAGE_KEY]: [{ runtimeId: runtime.id, url: "https://localhost:3080/", name: "native-session", partitionKey: { topLevelSite: "https://stored.example" } }],
    };
    await boot(); await vi.waitFor(() => expect(transport.connect).toHaveBeenCalledWith(available.endpoint, "saved-credential"));
    transport.callbacks!.ready();
    await vi.waitFor(() => expect(chromeMock.cookies.set).toHaveBeenCalled());
    transport.callbacks!.rejected("REVOKED", "Connection revoked."); transport.callbacks!.closed();
    await vi.waitFor(() => expect(data[COOKIE_SCOPES_STORAGE_KEY]).toEqual([]));
    expect(chromeMock.cookies.remove).toHaveBeenCalledWith(expect.objectContaining({ partitionKey: { topLevelSite: "https://stored.example" } }));
    expect(data[CREDENTIAL_STORAGE_KEY]).toEqual({});
    const response = await message("state.get");
    expect(response.result).toMatchObject({ connection: "disconnected", opacity: 0.23 });
    expect(response.result.surface).toBeUndefined();
  });

  it("registers a persistent alarm that retries an authorized runtime when offline", async () => {
    data = { [STATE_STORAGE_KEY]: { runtimeId: runtime.id }, [CREDENTIAL_STORAGE_KEY]: { [runtime.id]: "saved-credential" } };
    transport.discover.mockResolvedValue([]);
    await boot(); await vi.waitFor(() => expect(transport.discover).toHaveBeenCalledOnce());
    expect(chromeMock.alarms.create).toHaveBeenCalledWith("overcode-reconnect", { periodInMinutes: 0.5 });
    const onAlarm = chromeMock.alarms.onAlarm.addListener.mock.calls[0]![0];
    transport.discover.mockResolvedValue([available]);
    onAlarm({ name: "overcode-reconnect" });
    await vi.waitFor(() => expect(transport.connect).toHaveBeenCalledWith(available.endpoint, "saved-credential"));
  });

  it("rejects privileged requests from another extension or an iframe", async () => {
    await boot();
    expect(await message("runtime.connect", { id: "other-extension", frameId: 0, tab })).toBeUndefined();
    expect(await message("runtime.connect", { id: "extension-test", frameId: 2, tab })).toBeUndefined();
    expect(transport.connect).not.toHaveBeenCalled();
  });
});
