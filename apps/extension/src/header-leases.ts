import type { NativeSurface } from "@overcode/connector-contract";
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
  updateSessionRules(update: {
    readonly removeRuleIds?: readonly number[];
    readonly addRules?: readonly SessionRule[];
  }): Promise<void>;
}

interface HeaderLease {
  readonly ruleId: number;
  readonly runtimeId: string;
}

/**
 * Safari does not support blocking webRequest responses. Keep the delegated
 * cookie only inside a tab-scoped declarativeNetRequest session rule, so it is
 * neither persisted nor exposed to the content script or website JavaScript.
 */
export class HeaderLeaseManager {
  readonly #leases = new Map<number, HeaderLease>();
  #updates: Promise<void> = Promise.resolve();

  constructor(readonly updater: SessionRuleUpdater) {}

  restore(_value: unknown): void {}

  async ensure(tabId: number, pageUrl: string, surface: NativeSurface, isCurrent: () => boolean): Promise<boolean> {
    if (!topLevelSite(pageUrl) || !isCurrent()) return false;
    const surfaceUrl = new URL(surface.url);
    const surfaceOrigin = surfaceUrl.origin;
    if (surfaceOrigin !== `http://localhost:${surfaceUrl.port}`) return false;

    const lease = { ruleId: ruleIdForTab(tabId), runtimeId: surface.runtimeId };
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
        regexFilter: `^${escapeRegex(`${surfaceOrigin}/`)}`,
        isUrlFilterCaseSensitive: true,
        resourceTypes: RESOURCE_TYPES,
        tabIds: [tabId],
      },
    };
    await this.#enqueue(() => this.updater.updateSessionRules({ removeRuleIds: [lease.ruleId], addRules: [rule] }));
    if (this.#leases.get(tabId) !== lease || !isCurrent()) {
      if (this.#leases.get(tabId) === lease) this.#leases.delete(tabId);
      await this.#remove([lease.ruleId]);
      return false;
    }
    return true;
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

  idle(): Promise<void> {
    return this.#updates;
  }

  #remove(ruleIds: readonly number[]): Promise<void> {
    if (ruleIds.length === 0) return this.#updates;
    return this.#enqueue(() => this.updater.updateSessionRules({ removeRuleIds: ruleIds }));
  }

  #enqueue(update: () => Promise<void>): Promise<void> {
    const next = this.#updates.catch(() => {}).then(update);
    this.#updates = next;
    return next;
  }
}

function ruleIdForTab(tabId: number): number {
  if (!Number.isSafeInteger(tabId) || tabId < 0 || tabId >= 1_000_000_000) throw new Error("Invalid Safari tab id.");
  return RULE_ID_BASE + tabId;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
