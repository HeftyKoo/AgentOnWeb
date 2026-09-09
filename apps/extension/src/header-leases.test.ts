import { describe, expect, it, vi } from "vitest";
import { HeaderLeaseManager } from "./header-leases.js";

const surface = {
  runtimeId: "native-test",
  displayName: "Native test",
  url: "http://localhost:3080/",
  cookie: { name: "native-session", value: "private", maxAgeSeconds: 60 },
};

function setup() {
  const updateSessionRules = vi.fn(async () => {});
  return { leases: new HeaderLeaseManager({ updateSessionRules }), updateSessionRules };
}

describe("Safari declarative header leases", () => {
  it("creates a delegated session rule scoped to the matching local surface and tab", async () => {
    const { leases, updateSessionRules } = setup();
    expect(await leases.ensure(7, "https://example.org/page", surface, () => true)).toBe(true);
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [1_000_007],
      addRules: [{
        id: 1_000_007,
        priority: 1,
        action: { type: "modifyHeaders", requestHeaders: [{
          header: "Cookie", operation: "set", value: "native-session=private",
        }] },
        condition: {
          regexFilter: "^http://localhost:3080/",
          isUrlFilterCaseSensitive: true,
          resourceTypes: ["sub_frame", "stylesheet", "script", "image", "font", "xmlhttprequest", "ping", "media", "websocket", "other"],
          tabIds: [7],
        },
      }],
    });
    expect(JSON.stringify(updateSessionRules.mock.calls)).toContain("private");
  });

  it("drops tab and runtime rules without persisting the secret", async () => {
    const { leases, updateSessionRules } = setup();
    await leases.ensure(7, "https://example.org/", surface, () => true);
    leases.removeTab(7);
    await leases.idle();
    expect(updateSessionRules).toHaveBeenLastCalledWith({ removeRuleIds: [1_000_007] });

    await leases.ensure(8, "https://example.org/", surface, () => true);
    await leases.revoke(surface.runtimeId);
    expect(updateSessionRules).toHaveBeenLastCalledWith({ removeRuleIds: [1_000_008] });
  });

  it("removes a rule when the native surface changes during installation", async () => {
    const { leases, updateSessionRules } = setup();
    let current = true;
    updateSessionRules.mockImplementationOnce(async () => { current = false; });
    expect(await leases.ensure(7, "https://example.org/", surface, () => current)).toBe(false);
    expect(updateSessionRules).toHaveBeenLastCalledWith({ removeRuleIds: [1_000_007] });
  });

  it("shares an in-flight rule between a mode broadcast and toolbar presentation", async () => {
    const { leases, updateSessionRules } = setup();
    let release!: () => void;
    updateSessionRules.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const broadcast = leases.ensure(7, "https://example.org/", surface, () => true);
    const presentation = leases.ensure(7, "https://example.org/", surface, () => true);
    await vi.waitFor(() => expect(updateSessionRules).toHaveBeenCalledOnce());
    release();
    expect(await Promise.all([broadcast, presentation])).toEqual([true, true]);
    expect(await leases.ensure(7, "https://example.org/", surface, () => true)).toBe(true);
    expect(updateSessionRules).toHaveBeenCalledOnce();
  });

  it("does not remove a replacement rule after an obsolete install finishes", async () => {
    const { leases, updateSessionRules } = setup();
    let release!: () => void;
    updateSessionRules.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const old = leases.ensure(7, "https://example.org/", surface, () => true);
    await vi.waitFor(() => expect(updateSessionRules).toHaveBeenCalledOnce());
    const replacement = { ...surface, cookie: { ...surface.cookie, value: "replacement" } };
    const next = leases.ensure(7, "https://example.org/", replacement, () => true);
    release();
    expect(await Promise.all([old, next])).toEqual([false, true]);
    expect(updateSessionRules).toHaveBeenCalledTimes(2);
    expect(updateSessionRules).toHaveBeenLastCalledWith(expect.objectContaining({
      addRules: [expect.objectContaining({ action: expect.objectContaining({
        requestHeaders: [expect.objectContaining({ value: "native-session=replacement" })],
      }) })],
    }));
  });

});
