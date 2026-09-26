import { afterEach, expect, it, vi } from "vitest";
import { STATE_STORAGE_KEY } from "./shared.js";

const connection = vi.hoisted(() => ({ changed: undefined as any }));
vi.mock("./connection-coordinator.js", () => ({ ConnectionCoordinator: class {
  snapshots = new Map();
  snapshot = { view: { connection: "disconnected" } };
  constructor({ effects }: any) { connection.changed = effects.changed; }
  async restore() { connection.changed(this.snapshot); }
  async idle() {}
} }));
vi.mock("./native-setup.js", () => ({ nativeSetup: vi.fn(), probeNativeSetup: vi.fn(async () => ({ ok: false })) }));
afterEach(() => vi.unstubAllGlobals());

it("publishes to selected pages in every window, catches up on tab/window switches, and persists only changed preferences", async () => {
  vi.resetModules();
  let activeId = 1;
  const activated: (() => void)[] = [];
  const focused: ((id: number) => void)[] = [];
  const event = { addListener: vi.fn() };
  const sendMessage = vi.fn(async (_id: number, _message: unknown) => {});
  const set = vi.fn(async () => {});
  const query = vi.fn(async (options: { lastFocusedWindow?: boolean }) => [
    { id: activeId, url: "https://example.org/" },
    ...(!options.lastFocusedWindow ? [{ id: 9, url: "https://second-window.example/" }] : []),
  ]);
  vi.stubGlobal("chrome", {
    runtime: { id: "test", onMessage: event },
    storage: { local: { get: async () => ({}), set } },
    tabs: { query, sendMessage, onRemoved: event, onActivated: { addListener: (fn: () => void) => activated.push(fn) } },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: { addListener: (fn: (id: number) => void) => focused.push(fn) } },
    commands: { onCommand: event }, action: { onClicked: event }, alarms: { create: async () => {}, onAlarm: event },
  });
  await import("./background.js");
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
  expect(query).toHaveBeenLastCalledWith({ active: true });
  expect(sendMessage.mock.calls[0]?.[0]).toBe(1);
  sendMessage.mockClear();
  for (let index = 0; index < 20; index++) connection.changed({ view: {
    connection: "connected", agentSessions: [{ id: "one", title: `Update ${index}` }],
  } });
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
  expect(sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
    state: expect.objectContaining({ agentSessions: [{ id: "one", title: "Update 19" }] }),
  }));
  activeId = 2; activated[0]!();
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(4));
  expect(sendMessage).toHaveBeenCalledWith(2, expect.objectContaining({
    state: expect.objectContaining({ agentSessions: [{ id: "one", title: "Update 19" }] }),
  }));
  activeId = 3; focused[0]!(7);
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(6));
  expect(sendMessage.mock.calls.at(-2)?.[0]).toBe(3);
  expect(set).toHaveBeenCalledOnce();
  expect(set).toHaveBeenCalledWith({ [STATE_STORAGE_KEY]: { mode: "chill", opacity: expect.any(Number), dismissed: false } });
});
