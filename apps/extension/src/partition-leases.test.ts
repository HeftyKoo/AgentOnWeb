import { afterEach, describe, expect, it, vi } from "vitest";
import { PartitionLeaseManager } from "./partition-leases.js";

const surface = { runtimeId: "native-test", displayName: "Native test", url: "http://localhost:3080/",
  cookie: { name: "session", value: "private", maxAgeSeconds: 60 } };
afterEach(() => vi.useRealTimers());

describe("PartitionLeaseManager", () => {
  it("reinstalls an expired or invalidated cookie and replaces changed credentials", async () => {
    vi.useFakeTimers();
    const set = vi.fn(async () => true);
    const leases = new PartitionLeaseManager({ partition: async () => "https://example.org", set, remove: async () => {}, persist: async () => {} });
    await leases.ensure(1, "https://example.org/", surface, () => true);
    await vi.advanceTimersByTimeAsync(61_000);
    await leases.ensure(1, "https://example.org/", surface, () => true);
    expect(set).toHaveBeenCalledTimes(2);
    leases.invalidate();
    await leases.ensure(1, "https://example.org/", surface, () => true);
    expect(set).toHaveBeenCalledTimes(3);
    const renewed = { ...surface, cookie: { ...surface.cookie, value: "renewed" } };
    await leases.ensure(1, "https://example.org/", renewed, () => true);
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ value: "renewed" }));
  });
  it("serializes duplicate installs and revokes every persisted delegation", async () => {
    const set = vi.fn(async () => true);
    const remove = vi.fn(async () => {});
    const persist = vi.fn(async () => {});
    const leases = new PartitionLeaseManager({
      partition: vi.fn(async () => "https://example.org"), set, remove, persist,
    });
    await Promise.all([
      leases.ensure(1, "https://example.org/page", surface, () => true),
      leases.ensure(1, "https://example.org/page", surface, () => true),
    ]);
    expect(set).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
    await leases.revoke(surface.runtimeId);
    expect(remove).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenLastCalledWith([]);
  });

  it("removes a cookie when the active surface changes during installation", async () => {
    let current = true;
    const remove = vi.fn(async () => {});
    const leases = new PartitionLeaseManager({
      partition: vi.fn(async () => "https://example.org"),
      set: vi.fn(async () => { current = false; return true; }),
      remove,
      persist: vi.fn(async () => {}),
    });
    expect(await leases.ensure(1, "https://example.org/", surface, () => current)).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
  });
});
