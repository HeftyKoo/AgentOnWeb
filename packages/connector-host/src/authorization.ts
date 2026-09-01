import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/u;
const TTL = 120_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

interface Grant { id: string; origin: string; hash: string; createdAt: number }
interface Pending { id: string; origin: string; expiresAt: number }
interface Waiting extends Pending {
  resolve: (grant: { id: string; credential: string }) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class AuthorizationError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Only the native host's authenticated UI may call decide() or revoke(). */
export class Authorization {
  #grants: Grant[];
  #waiting = new Map<string, Waiting>();
  #writes: Promise<void> = Promise.resolve();
  #revoked = new Set<(id: string) => void>();
  private constructor(readonly directory: string, grants: Grant[]) { this.#grants = grants; }

  static async open(directory: string): Promise<Authorization> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let grants: Grant[] = [];
    try {
      const data: unknown = JSON.parse(await readFile(join(directory, "connections.json"), "utf8"));
      if (!Array.isArray(data) || !data.every((g: Partial<Grant>) => g && typeof g.id === "string"
        && typeof g.origin === "string" && EXTENSION_ORIGIN.test(g.origin)
        && typeof g.hash === "string" && /^[a-f0-9]{64}$/u.test(g.hash)
        && typeof g.createdAt === "number")) throw new Error("Invalid Overcode connections file.");
      grants = data as Grant[];
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return new Authorization(directory, grants);
  }

  snapshot(): { pending: Pending[]; grants: Omit<Grant, "hash">[] } {
    return {
      pending: [...this.#waiting.values()].map(({ id, origin, expiresAt }) => ({ id, origin, expiresAt })),
      grants: this.#grants.map(({ id, origin, createdAt }) => ({ id, origin, createdAt })),
    };
  }

  authenticate(origin: string, credential: string): string {
    const actual = Buffer.from(hash(credential), "hex");
    const grant = this.#grants.find((g) => g.origin === origin && timingSafeEqual(Buffer.from(g.hash, "hex"), actual));
    if (!grant) throw new AuthorizationError("AUTHENTICATION_FAILED", "Connection authorization expired or was revoked. Connect again to request approval.");
    return grant.id;
  }

  request(origin: string): { request: Pending; result: Promise<{ id: string; credential: string }>; cancel: () => void } {
    if (!EXTENSION_ORIGIN.test(origin)) throw new AuthorizationError("INVALID_ORIGIN", "Only a Chromium extension may connect.");
    if (this.#waiting.size >= 8 || [...this.#waiting.values()].some((p) => p.origin === origin)) {
      throw new AuthorizationError("REQUEST_PENDING", "A connection request is already pending. Approve it in the runtime or wait for it to expire.");
    }
    const request = { id: randomUUID(), origin, expiresAt: Date.now() + TTL };
    const result = new Promise<{ id: string; credential: string }>((resolve, reject) => {
      const timer = setTimeout(() => this.cancel(request.id, "EXPIRED", "Connection request expired. Try again."), TTL);
      timer.unref();
      this.#waiting.set(request.id, { ...request, resolve, reject, timer });
    });
    return { request, result, cancel: () => this.cancel(request.id, "CANCELLED", "Connection request cancelled.") };
  }

  async decide(id: string, allow: boolean): Promise<void> {
    const pending = this.#waiting.get(id);
    if (!pending || pending.expiresAt <= Date.now()) throw new AuthorizationError("EXPIRED", "Connection request expired.");
    this.#waiting.delete(id);
    clearTimeout(pending.timer);
    if (!allow) { pending.reject(new AuthorizationError("DENIED", "Connection was declined in the runtime.")); return; }
    const credential = randomBytes(32).toString("base64url");
    const grant = { id: randomUUID(), origin: pending.origin, hash: hash(credential), createdAt: Date.now() };
    this.#grants.push(grant);
    try { await this.persist(); pending.resolve({ id: grant.id, credential }); }
    catch (error) {
      this.#grants = this.#grants.filter((g) => g.id !== grant.id);
      pending.reject(new AuthorizationError("STORAGE_ERROR", "Could not save connection authorization."));
      throw error;
    }
  }

  async revoke(id: string): Promise<void> {
    if (!this.#grants.some((g) => g.id === id)) throw new Error("Connection does not exist.");
    this.#grants = this.#grants.filter((g) => g.id !== id);
    await this.persist();
    for (const callback of this.#revoked) callback(id);
  }

  onRevoke(callback: (id: string) => void): () => void {
    this.#revoked.add(callback);
    return () => { this.#revoked.delete(callback); };
  }

  close(): void {
    for (const id of this.#waiting.keys()) this.cancel(id, "STOPPED", "Runtime stopped.");
  }

  private cancel(id: string, code: string, message: string): void {
    const pending = this.#waiting.get(id);
    if (!pending) return;
    this.#waiting.delete(id);
    clearTimeout(pending.timer);
    pending.reject(new AuthorizationError(code, message));
  }

  private persist(): Promise<void> {
    const body = JSON.stringify(this.#grants, null, 2) + "\n";
    const write = async () => {
      const temporary = join(this.directory, `connections.${randomUUID()}.tmp`);
      await writeFile(temporary, body, { mode: 0o600 });
      await rename(temporary, join(this.directory, "connections.json"));
    };
    this.#writes = this.#writes.catch(() => {}).then(write);
    return this.#writes;
  }
}
