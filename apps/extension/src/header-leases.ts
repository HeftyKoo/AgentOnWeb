import type { NativeSurface } from "@agentonweb/connector-contract";
import { topLevelSite } from "./surface-cookie.js";

const RULE_ID_BASE = 1_000_000;
const RESOURCE_TYPES = [
  "sub_frame", "stylesheet", "script", "image", "font", "xmlhttprequest", "ping", "media", "websocket", "other",
] as const;

interface SessionRule {
  readonly id: number;
  readonly priority: number;
  readonly action: {
    readonly type: "modifyHeaders";
    readonly requestHeaders: readonly [{
      readonly header: "Cookie";
      readonly operation: "set";
      readonly value: string;
    }];
  };
  readonly condition: {
    readonly regexFilter: string;
    readonly isUrlFilterCaseSensitive: true;
    readonly resourceTypes: typeof RESOURCE_TYPES;
    readonly tabIds: readonly [number];
  };
}

export interface SessionRuleUpdater {
  getSessionRules?(): Promise<readonly { readonly id: number }[]>;
  updateSessionRules(update: {
    readonly removeRuleIds?: readonly number[];
    readonly addRules?: readonly SessionRule[];
  }): Promise<void>;
}

interface HeaderLease {
  readonly ruleId: number;
  readonly runtimeId: string;
  readonly surface: NativeSurface;
  ready: Promise<boolean>;
}

/**
 * Safari does not support blocking webRequest responses. Keep the delegated
 * HTTP cookie in a tab-scoped declarativeNetRequest session rule, so content
 * scripts never receive it. SafariCookieLeaseManager separately owns the
 * HttpOnly cookie required by Safari WebSocket handshakes.
 */
export class HeaderLeaseManager {
  readonly #leases = new Map<string, HeaderLease>();
  #nextRuleId = RULE_ID_BASE;
  #updates: Promise<unknown> = Promise.resolve();

  constructor(readonly updater: SessionRuleUpdater) {}

  restore(_value: unknown): void {}

  /** Browser session rules outlive a suspended/restarted extension background. */
  resetAfterRestart(): Promise<void> {
    return this.#enqueue(async () => {
      const existing = await this.updater.getSessionRules?.() ?? [];
      const staleIds = existing.filter(rule => rule.id >= RULE_ID_BASE).map(rule => rule.id);
      if (staleIds.length) await this.updater.updateSessionRules({ removeRuleIds: staleIds });
      this.#leases.clear();
      this.#nextRuleId = RULE_ID_BASE;
    });
  }

  async ensure(tabId: number, pageUrl: string, surface: NativeSurface, isCurrent: () => boolean): Promise<boolean> {
    if (!topLevelSite(pageUrl) || !isCurrent()) return false;
    const surfaceUrl = new URL(surface.url);
    const surfaceOrigin = surfaceUrl.origin;
    if (surfaceOrigin !== `http://localhost:${surfaceUrl.port}`) return false;

    const key = `${tabId}:${surface.runtimeId}`;
    const existing = this.#leases.get(key);
    if (new URL(pageUrl).origin === surfaceOrigin) {
      // First-party runtime pages already receive their native cookies. Replacing
      // that header would discard the separate terminal administrator cookie.
      // Remove a previous website lease when this tab navigates to the runtime.
      if (existing) this.#leases.delete(key);
      await this.#remove(existing ? [existing.ruleId] : []);
      return isCurrent();
    }
    if (existing?.surface === surface) return await existing.ready && isCurrent();
    const lease: HeaderLease = { ruleId: existing?.ruleId ?? ++this.#nextRuleId, runtimeId: surface.runtimeId,
      surface, ready: Promise.resolve(false) };
    this.#leases.set(key, lease);
    const rule: SessionRule = {
      id: lease.ruleId,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{
          header: "Cookie",
          operation: "set",
          value: `${surface.cookie.name}=${surface.cookie.value}`,
        }],
      },
      condition: {
        regexFilter: `^${escapeRegex(`${surfaceOrigin}/`)}`,
        isUrlFilterCaseSensitive: true,
        resourceTypes: RESOURCE_TYPES,
        tabIds: [tabId],
      },
    };
    lease.ready = this.#enqueue(async () => {
      if (this.#leases.get(key) !== lease || !isCurrent()) return false;
      await this.updater.updateSessionRules({ removeRuleIds: [lease.ruleId], addRules: [rule] });
      if (this.#leases.get(key) !== lease || !isCurrent()) {
        // A newer lease replaces this rule, and revoke/removeTab already queues
        // its removal. Never delete a successor's rule after it is installed.
        if (this.#leases.get(key) === lease) {
          this.#leases.delete(key);
          await this.updater.updateSessionRules({ removeRuleIds: [lease.ruleId] });
        }
        return false;
      }
      return true;
    });
    try { return await lease.ready; }
    catch (error) {
      if (this.#leases.get(key) === lease) this.#leases.delete(key);
      throw error;
    }
  }

  async revoke(runtimeId: string): Promise<void> {
    const ruleIds: number[] = [];
    for (const [key, lease] of this.#leases) {
      if (lease.runtimeId !== runtimeId) continue;
      this.#leases.delete(key);
      ruleIds.push(lease.ruleId);
    }
    await this.#remove(ruleIds);
  }

  invalidate(): void {
    const ruleIds = [...this.#leases.values()].map((lease) => lease.ruleId);
    this.#leases.clear();
    this.#remove(ruleIds);
  }

  removeTab(tabId: number): void {
    const ids: number[] = [];
    for (const [key, lease] of this.#leases) if (key.startsWith(`${tabId}:`)) { this.#leases.delete(key); ids.push(lease.ruleId); }
    void this.#remove(ids);
  }

  idle(): Promise<unknown> {
    return this.#updates;
  }

  #remove(ruleIds: readonly number[]): Promise<void> {
    if (ruleIds.length === 0) return this.#updates.then(() => {});
    return this.#enqueue(() => this.updater.updateSessionRules({ removeRuleIds: ruleIds }));
  }

  #enqueue<T>(update: () => Promise<T>): Promise<T> {
    const next = this.#updates.catch(() => {}).then(update);
    this.#updates = next;
    return next;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
