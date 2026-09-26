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
  getSessionRules(): Promise<readonly { readonly id: number }[]>;
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
 * Send exactly one current native session cookie. Otherwise a stale first-party
 * cookie can precede the delegated partitioned cookie and DSH rejects the request.
 * Rules stay in the extension, scoped to one tab and localhost port. Browsers
 * also need their cookie lease for WebSocket handshakes that bypass these rules.
 */
export class HeaderLeaseManager {
  readonly #leases = new Map<number, HeaderLease>();
  #updates: Promise<unknown> = Promise.resolve();
  #nextRuleId = RULE_ID_BASE;

  constructor(readonly updater: SessionRuleUpdater) {}

  reset(): Promise<void> {
    this.#leases.clear();
    return this.#enqueue(async () => {
      // Session rules outlive MV3 worker suspension. Drop any old delegation
      // before reconnecting and obtaining a fresh authorized surface.
      const rules = await this.updater.getSessionRules();
      const removeRuleIds = rules.map(({ id }) => id)
        .filter((id) => id >= RULE_ID_BASE && id < RULE_ID_BASE + 1_000_000_000);
      if (removeRuleIds.length) await this.updater.updateSessionRules({ removeRuleIds });
    });
  }

  async ensure(tabId: number, pageUrl: string, surface: NativeSurface, isCurrent: () => boolean): Promise<boolean> {
    if (!topLevelSite(pageUrl) || !isCurrent()) return false;
    if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error("Invalid native surface tab id.");
    const surfaceUrl = new URL(surface.url);
    const surfaceOrigin = surfaceUrl.origin;
    if (surfaceOrigin !== `http://localhost:${surfaceUrl.port}`) return false;

    const existing = this.#leases.get(tabId);
    if (existing?.surface === surface) return await existing.ready && isCurrent();
    // Chromium tab ids may exceed a billion. Allocate small rule ids instead
    // of deriving them from tab ids (DNR ids must remain positive int32s).
    const lease: HeaderLease = { ruleId: existing?.ruleId ?? ++this.#nextRuleId, runtimeId: surface.runtimeId,
      surface, ready: Promise.resolve(false) };
    this.#leases.set(tabId, lease);
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
        regexFilter: `^(http|ws)://${escapeRegex(`${surfaceUrl.host}/`)}`,
        isUrlFilterCaseSensitive: true,
        resourceTypes: RESOURCE_TYPES,
        tabIds: [tabId],
      },
    };
    lease.ready = this.#enqueue(async () => {
      if (this.#leases.get(tabId) !== lease || !isCurrent()) return false;
      await this.updater.updateSessionRules({ removeRuleIds: [lease.ruleId], addRules: [rule] });
      if (this.#leases.get(tabId) !== lease || !isCurrent()) {
        // A newer lease replaces this rule, and revoke/removeTab already queues
        // its removal. Never delete a successor's rule after it is installed.
        if (this.#leases.get(tabId) === lease) {
          this.#leases.delete(tabId);
          await this.updater.updateSessionRules({ removeRuleIds: [lease.ruleId] });
        }
        return false;
      }
      return true;
    });
    try { return await lease.ready; }
    catch (error) {
      if (this.#leases.get(tabId) === lease) this.#leases.delete(tabId);
      throw error;
    }
  }

  async revoke(runtimeId: string): Promise<void> {
    const ruleIds: number[] = [];
    for (const [tabId, lease] of this.#leases) {
      if (lease.runtimeId !== runtimeId) continue;
      this.#leases.delete(tabId);
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
    const lease = this.#leases.get(tabId);
    if (!lease) return;
    this.#leases.delete(tabId);
    this.#remove([lease.ruleId]);
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
