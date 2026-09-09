import { describe, expect, it, vi } from "vitest";
import { SafariCookieLeaseManager } from "./safari-cookie-leases.js";

const surface = { runtimeId: "native-test", displayName: "Native test", url: "http://localhost:3080/",
  cookie: { name: "native-session", value: "delegated-secret", maxAgeSeconds: 60 } };
function setup() {
  const set = vi.fn(async (_details: unknown) => true);
  const remove = vi.fn(async (_details: unknown) => {});
  const persist = vi.fn(async (_scopes: unknown) => {});
  return { leases: new SafariCookieLeaseManager({ set, remove, persist }), set, remove, persist };
}
describe("Safari storage-access cookie lease", () => {
  it("keeps the delegated session HttpOnly on loopback and persists no credential", async () => {
    const { leases, set, persist } = setup();
    expect(await leases.ensure(surface, () => true)).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ url: surface.url, value: "delegated-secret",
      httpOnly: true, secure: false, sameSite: "no_restriction" }));
    expect(JSON.stringify(persist.mock.calls)).not.toContain("delegated-secret");
    await leases.ensure(surface, () => true);
    expect(set).toHaveBeenCalledTimes(1);
  });
  it("rejects non-loopback and credential-bearing URLs", async () => {
    const { leases, set } = setup();
    for (const url of ["http://example.org:3080/", "http://localhost.evil.test:3080/", "http://user@localhost:3080/", "http://localhost:3080/?token=x"]) {
      expect(await leases.ensure({ ...surface, url }, () => true)).toBe(false);
    }
    expect(set).not.toHaveBeenCalled();
  });
  it("removes a cookie if the runtime changed during installation", async () => {
    const { leases, set, remove } = setup();
    let current = true;
    set.mockImplementationOnce(async () => { current = false; return true; });
    expect(await leases.ensure(surface, () => current)).toBe(false);
    expect(remove).toHaveBeenCalledWith({ url: surface.url, name: surface.cookie.name });
  });
  it("revokes a restored scope and rejects unrelated stored scopes", async () => {
    const { leases, remove, persist } = setup();
    leases.restore([{ runtimeId: surface.runtimeId, url: surface.url, name: surface.cookie.name },
      { runtimeId: "unrelated", url: "https://example.org/", name: "session" }]);
    await leases.revoke(surface.runtimeId);
    await leases.revoke("unrelated");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith([]);
  });
});
