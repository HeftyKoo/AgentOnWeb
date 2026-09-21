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
  return {
    leases: new HeaderLeaseManager({ updateSessionRules }),
    updateSessionRules,
  };
}

describe("Safari declarative header leases", () => {
  it("creates a delegated session rule scoped to the matching local surface and tab", async () => {
    const { leases, updateSessionRules } = setup();
    expect(await leases.ensure(7, "https://example.org/page", surface, () => true)).toBe(true);
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [1_000_001],
      addRules: [
        {
          id: 1_000_001,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "Cookie",
                operation: "set",
                value: "native-session=private",
              },
            ],
          },
          condition: {
            regexFilter: "^http://localhost:3080/",
            isUrlFilterCaseSensitive: true,
            resourceTypes: [
              "sub_frame",
              "stylesheet",
              "script",
              "image",
              "font",
              "xmlhttprequest",
              "ping",
              "media",
              "websocket",
              "other",
            ],
            tabIds: [7],
          },
        },
      ],
    });
    expect(JSON.stringify(updateSessionRules.mock.calls)).toContain("private");
  });

  it("preserves native management cookies without installing a header replacement", async () => {
    const { leases, updateSessionRules } = setup();
    expect(await leases.ensure(7, "http://localhost:3080/launch?token=private-setup", surface, () => true)).toBe(true);
    expect(await leases.ensure(7, "http://localhost:3080/", surface, () => true)).toBe(true);
    expect(updateSessionRules).not.toHaveBeenCalled();
  });

  it("removes only the native origin's old lease when a website tab navigates to management", async () => {
    const { leases, updateSessionRules } = setup();
    const other = {
      ...surface,
      runtimeId: "terminal",
      url: "http://localhost:9000/",
    };
    await leases.ensure(7, "https://example.org/", surface, () => true);
    await leases.ensure(7, "https://example.org/", other, () => true);
    expect(await leases.ensure(7, "http://localhost:3080/", surface, () => true)).toBe(true);
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [1_000_001],
    });

    // Another runtime's rule remains usable, and returning to a website restores
    // delegated access without reviving the removed rule on the management page.
    expect(await leases.ensure(7, "http://localhost:3080/", other, () => true)).toBe(true);
    expect(updateSessionRules).toHaveBeenCalledTimes(3);
    expect(await leases.ensure(7, "https://example.org/", surface, () => true)).toBe(true);
    expect(updateSessionRules).toHaveBeenLastCalledWith(
      expect.objectContaining({
        addRules: [expect.objectContaining({ id: 1_000_003 })],
      }),
    );
  });

  it("removes an in-flight website lease before completing a native management visit", async () => {
    const { leases, updateSessionRules } = setup();
    let release!: () => void;
    updateSessionRules.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const website = leases.ensure(7, "https://example.org/", surface, () => true);
    await vi.waitFor(() => expect(updateSessionRules).toHaveBeenCalledOnce());
    const management = leases.ensure(7, surface.url, surface, () => true);
    release();
    expect(await Promise.all([website, management])).toEqual([false, true]);
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [1_000_001],
    });
  });

  it("drops tab and runtime rules without persisting the secret", async () => {
    const { leases, updateSessionRules } = setup();
    await leases.ensure(7, "https://example.org/", surface, () => true);
    leases.removeTab(7);
    await leases.idle();
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [1_000_001],
    });

    await leases.ensure(8, "https://example.org/", surface, () => true);
    await leases.revoke(surface.runtimeId);
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [1_000_002],
    });
  });

  it("removes a rule when the native surface changes during installation", async () => {
    const { leases, updateSessionRules } = setup();
    let current = true;
    updateSessionRules.mockImplementationOnce(async () => {
      current = false;
    });
    expect(await leases.ensure(7, "https://example.org/", surface, () => current)).toBe(false);
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [1_000_001],
    });
  });

  it("shares an in-flight rule between a mode broadcast and toolbar presentation", async () => {
    const { leases, updateSessionRules } = setup();
    let release!: () => void;
    updateSessionRules.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
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
    updateSessionRules.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const old = leases.ensure(7, "https://example.org/", surface, () => true);
    await vi.waitFor(() => expect(updateSessionRules).toHaveBeenCalledOnce());
    const replacement = {
      ...surface,
      cookie: { ...surface.cookie, value: "replacement" },
    };
    const next = leases.ensure(7, "https://example.org/", replacement, () => true);
    release();
    expect(await Promise.all([old, next])).toEqual([false, true]);
    expect(updateSessionRules).toHaveBeenCalledTimes(2);
    expect(updateSessionRules).toHaveBeenLastCalledWith(
      expect.objectContaining({
        addRules: [
          expect.objectContaining({
            action: expect.objectContaining({
              requestHeaders: [
                expect.objectContaining({
                  value: "native-session=replacement",
                }),
              ],
            }),
          }),
        ],
      }),
    );
  });

  it("keeps two runtimes in the same Safari tab and revokes only the selected runtime", async () => {
    const { leases, updateSessionRules } = setup();
    await leases.ensure(7, "https://example.org/", surface, () => true);
    const other = {
      ...surface,
      runtimeId: "terminal",
      url: "http://localhost:9000/",
      cookie: { ...surface.cookie, name: "terminal-session" },
    };
    await leases.ensure(7, "https://example.org/", other, () => true);
    const first = updateSessionRules.mock.calls[0] as unknown as [{ addRules: [{ id: number }] }];
    const second = updateSessionRules.mock.calls[1] as unknown as [{ addRules: [{ id: number }] }];
    expect(first[0].addRules[0].id).not.toBe(second[0].addRules[0].id);
    await leases.revoke("terminal");
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [second[0].addRules[0].id],
    });
    expect(await leases.ensure(7, "https://example.org/", surface, () => true)).toBe(true);
    expect(updateSessionRules).toHaveBeenCalledTimes(3);
  });

  it("clears stale managed Safari rules on background restart before reusing rule IDs", async () => {
    const updateSessionRules = vi.fn(async () => {});
    const leases = new HeaderLeaseManager({
      getSessionRules: async () => [{ id: 12 }, { id: 1_000_001 }, { id: 1_000_025 }],
      updateSessionRules,
    });
    await leases.resetAfterRestart();
    expect(updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [1_000_001, 1_000_025],
    });
    await leases.ensure(7, "https://example.org/", surface, () => true);
    expect(updateSessionRules).toHaveBeenLastCalledWith(
      expect.objectContaining({
        addRules: [expect.objectContaining({ id: 1_000_001 })],
      }),
    );
  });
});
