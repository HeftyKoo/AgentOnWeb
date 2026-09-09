import type { NativeSurface } from "@agentonweb/connector-contract";

export interface SafariCookieScope {
  readonly runtimeId: string;
  readonly url: string;
  readonly name: string;
}

interface SafariCookieEffects {
  set(details: { url: string; name: string; value: string; path: "/"; httpOnly: true;
    secure: false; sameSite: "no_restriction"; expirationDate: number }): Promise<boolean>;
  remove(details: { url: string; name: string }): Promise<void>;
  persist(scopes: readonly SafariCookieScope[]): Promise<void>;
}

/** Safari's Storage Access API grants per-site use of this loopback-only cookie.
 * WebSocket handshakes do not receive Safari's DNR header modifications.
 * The cookie stays HttpOnly; neither the website nor content scripts receive it.
 */
export class SafariCookieLeaseManager {
  readonly #scopes = new Map<string, SafariCookieScope>();
  readonly #installed = new Map<string, NativeSurface>();
  #operations: Promise<unknown> = Promise.resolve();
  constructor(readonly effects: SafariCookieEffects) {}

  restore(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (!item || typeof item !== "object" || typeof item.runtimeId !== "string"
        || typeof item.name !== "string" || !isSafariCookieUrl(item.url)) continue;
      this.#scopes.set(item.runtimeId, { runtimeId: item.runtimeId, url: item.url, name: item.name });
    }
  }

  ensure(surface: NativeSurface, current: () => boolean): Promise<boolean> {
    return this.#enqueue(async () => {
      if (!isSafariCookieUrl(surface.url) || !current()) return false;
      if (this.#installed.get(surface.runtimeId) === surface) return true;
      const details = { url: surface.url, name: surface.cookie.name, value: surface.cookie.value,
        path: "/" as const, httpOnly: true as const, secure: false as const,
        sameSite: "no_restriction" as const, expirationDate: Date.now() / 1000 + surface.cookie.maxAgeSeconds };
      if (!await this.effects.set(details)) throw new Error("Allow AgentOnWeb access to localhost in Safari, then connect again.");
      if (!current()) {
        await this.effects.remove({ url: details.url, name: details.name });
        return false;
      }
      this.#installed.set(surface.runtimeId, surface);
      this.#scopes.set(surface.runtimeId, { runtimeId: surface.runtimeId, url: details.url, name: details.name });
      await this.effects.persist([...this.#scopes.values()]);
      return true;
    });
  }

  revoke(runtimeId: string): Promise<void> {
    return this.#enqueue(async () => {
      const scope = this.#scopes.get(runtimeId);
      if (scope) await this.effects.remove({ url: scope.url, name: scope.name });
      this.#installed.delete(runtimeId);
      this.#scopes.delete(runtimeId);
      await this.effects.persist([...this.#scopes.values()]);
    });
  }

  invalidate(): void {
    this.#installed.clear();
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operations.catch(() => {}).then(operation);
    this.#operations = result;
    return result;
  }
}

export function isSafariCookieUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === `http://localhost:${url.port}` && !!url.port && url.pathname === "/"
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
