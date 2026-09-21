import { afterEach, expect, it, vi } from "vitest";

vi.mock("./connection-coordinator.js", () => ({
  ConnectionCoordinator: class {
    restore = async () => {};
    idle = async () => {};
  },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
it("gives a visible fallback when a toolbar click cannot reach a page", async () => {
  let clicked!: (tab: { id: number; url: string }) => void;
  const create = vi.fn(async () => ({ id: 2 }));
  const event = () => ({ addListener: vi.fn() });
  vi.stubEnv("BROWSER", "safari");
  vi.stubGlobal("browser", {
    runtime: { id: "test", getURL: (path: string) => `safari-web-extension://test/${path}`, onMessage: event() },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async () => {} },
    alarms: { create: async () => {}, onAlarm: event() },
    commands: { onCommand: event() },
    browserAction: { onClicked: { addListener: (handler: typeof clicked) => { clicked = handler; } } },
    permissions: { request: async () => true },
    tabs: { create, query: async () => [], onRemoved: event(), sendMessage: async () => { throw new Error("No receiving end"); } },
  });
  await import("./background.js");
  clicked({ id: 1, url: "https://example.org/" });
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
});
