import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthorizationError, PairingAuthority } from "./credentials.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("PairingAuthority", () => {
  it("pairs once, stores only a hash, and authenticates only the paired extension", async () => {
    const directory = await mkdtemp(join(tmpdir(), "overcode-pairing-"));
    directories.push(directory);
    const authority = await PairingAuthority.open(directory);
    const origin = `chrome-extension://${"a".repeat(32)}`;
    const code = authority.pairingCode;
    expect(code).toMatch(/^\d{8}$/);
    if (!code) throw new Error("Expected pairing code");

    const paired = await authority.authorize(origin, { pairingCode: code });
    expect(paired.credential).toBeTruthy();
    expect(authority.pairingCode).toBeUndefined();
    if (!paired.credential) throw new Error("Expected installation credential");

    const stored = await readFile(join(directory, "bridge-credential.json"), "utf8");
    expect(stored).not.toContain(paired.credential);
    await expect(authority.authorize(origin, { credential: paired.credential })).resolves.toEqual({ paired: true });
    await expect(authority.authorize(`chrome-extension://${"b".repeat(32)}`, { credential: paired.credential }))
      .rejects.toBeInstanceOf(AuthorizationError);
  });
});
