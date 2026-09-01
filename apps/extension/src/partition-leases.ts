import type { NativeSurface } from "@overcode/connector-contract";
import { surfaceCookieDetails, topLevelSite, type SurfaceCookieDetails } from "./surface-cookie.js";

export interface PersistedCookieScope {
  readonly runtimeId: string;
  readonly url: string;
  readonly name: string;
  readonly partitionKey: { readonly topLevelSite: string };
}

interface PartitionLeaseEffects {
  partition(tabId: number): Promise<string | undefined>;
  set(details: SurfaceCookieDetails): Promise<boolean>;
  remove(details: Omit<PersistedCookieScope, "runtimeId">): Promise<void>;
  persist(scopes: readonly PersistedCookieScope[]): Promise<void>;
}

/** Owns delegated cookie installation, persistence, stale-write cleanup and revocation. */
export class PartitionLeaseManager {
  readonly #effects: PartitionLeaseEffects;
  readonly #installed = new Set<string>();
  readonly #scopes = new Map<string, PersistedCookieScope>();
  #operations: Promise<unknown> = Promise.resolve();

  constructor(effects: PartitionLeaseEffects) {
    this.#effects = effects;
  }

  restore(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const candidate of value) {
      if (!candidate || typeof candidate !== "object") continue;
      const scope = candidate as Partial<PersistedCookieScope>;
      if (typeof scope.runtimeId !== "string" || typeof scope.url !== "string" || typeof scope.name !== "string"
        || typeof scope.partitionKey?.topLevelSite !== "string" || !topLevelSite(scope.partitionKey.topLevelSite)) continue;
      const normalized: PersistedCookieScope = {
        runtimeId: scope.runtimeId,
        url: scope.url,
        name: scope.name,
        partitionKey: { topLevelSite: scope.partitionKey.topLevelSite },
      };
      this.#scopes.set(this.#key(normalized.name, normalized.partitionKey.topLevelSite), normalized);
    }
  }

  ensure(tabId: number, pageUrl: string, surface: NativeSurface, isCurrent: () => boolean): Promise<boolean> {
    return this.#enqueue(async () => {
      const topLevel = topLevelSite(pageUrl);
      if (!topLevel || !isCurrent()) return false;
      const partition = await this.#effects.partition(tabId);
      if (!partition || !isCurrent()) return false;
      const details = surfaceCookieDetails(surface, partition);
      if (!details) return false;
      const key = this.#key(details.name, details.partitionKey.topLevelSite);
      if (!this.#installed.has(key)) {
        if (!await this.#effects.set(details)) throw new Error("Chrome refused the isolated native runtime session.");
        if (!isCurrent()) {
          await this.#effects.remove({ url: details.url, name: details.name, partitionKey: details.partitionKey });
          return false;
        }
        this.#installed.add(key);
        this.#scopes.set(key, { runtimeId: surface.runtimeId, url: details.url, name: details.name, partitionKey: details.partitionKey });
        await this.#effects.persist([...this.#scopes.values()]);
      }
      return isCurrent();
    });
  }

  revoke(runtimeId: string): Promise<void> {
    return this.#enqueue(async () => {
      const scopes = [...this.#scopes.entries()].filter(([, scope]) => scope.runtimeId === runtimeId);
      await Promise.allSettled(scopes.map(async ([key, { runtimeId: _runtimeId, ...details }]) => {
        await this.#effects.remove(details);
        this.#scopes.delete(key);
        this.#installed.delete(key);
      }));
      await this.#effects.persist([...this.#scopes.values()]);
    });
  }

  invalidate(): void {
    this.#installed.clear();
  }

  idle(): Promise<void> {
    return this.#operations.then(() => undefined);
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operations.catch(() => {}).then(operation);
    this.#operations = result;
    return result;
  }

  #key(name: string, topLevelSite: string): string {
    return `${name}\n${topLevelSite}`;
  }
}
