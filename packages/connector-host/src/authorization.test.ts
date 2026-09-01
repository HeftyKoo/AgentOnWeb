import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Authorization } from "./authorization.js";
const directories: string[] = [];
const origin = `chrome-extension://${"a".repeat(32)}`;
async function open() { const dir = await mkdtemp(join(tmpdir(), "overcode-auth-")); directories.push(dir); return Authorization.open(dir); }
afterEach(async () => { vi.useRealTimers(); await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("connector host authorization", () => {
  it("issues no credential until approved; stores only a hash and binds the origin across restart", async () => {
    const authority = await open();
    const pending = authority.request(origin);
    expect(authority.snapshot().grants).toHaveLength(0);
    expect(authority.snapshot().pending).toEqual([pending.request]);
    await authority.decide(pending.request.id, true);
    const grant = await pending.result;
    expect(authority.authenticate(origin, grant.credential)).toBe(grant.id);
    const file = join(authority.directory, "connections.json");
    expect(await readFile(file, "utf8")).not.toContain(grant.credential);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const reopened = await Authorization.open(authority.directory);
    expect(reopened.authenticate(origin, grant.credential)).toBe(grant.id);
    expect(() => reopened.authenticate(`chrome-extension://${"b".repeat(32)}`, grant.credential)).toThrow();
    expect(() => reopened.authenticate(origin, "wrong")).toThrow();
    await reopened.revoke(grant.id);
    expect(() => reopened.authenticate(origin, grant.credential)).toThrow();
    expect((await Authorization.open(authority.directory)).snapshot().grants).toHaveLength(0);
  });
  it("supports decline, cancellation, bounded expiry, and no implicit approval", async () => {
    const authority = await open();
    for (const action of ["deny", "cancel", "expire"] as const) {
      const pending = authority.request(origin);
      const rejected = expect(pending.result).rejects.toThrow();
      if (action === "deny") await authority.decide(pending.request.id, false);
      if (action === "cancel") pending.cancel();
      if (action === "expire") { vi.useFakeTimers(); /* Existing timers use wall time; exercise late decisions. */
        vi.setSystemTime(Date.now() + 121_000);
        await expect(authority.decide(pending.request.id, true)).rejects.toThrow("expired");
        pending.cancel(); vi.useRealTimers(); }
      await rejected;
      expect(authority.snapshot().grants).toHaveLength(0);
      expect(authority.snapshot().pending).toHaveLength(0);
    }
  });
  it("rejects web origins and duplicate requests; shutdown cancels pending requests", async () => {
    const authority = await open();
    expect(() => authority.request("https://example.org")).toThrow();
    const pending = authority.request(origin);
    const rejected = expect(pending.result).rejects.toThrow("stopped");
    expect(() => authority.request(origin)).toThrow("already pending");
    authority.close(); await rejected;
  });
  it("expires pending requests without any client or UI action", async () => {
    const authority = await open();
    vi.useFakeTimers();
    const pending = authority.request(origin);
    const rejected = expect(pending.result).rejects.toThrow("expired");
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(authority.snapshot()).toEqual({ pending: [], grants: [] });
    await expect(authority.decide(pending.request.id, true)).rejects.toThrow("expired");
  });
});
