import type { AgentOnWebMode } from "@agentonweb/connector-contract";

type ThemeTokens = Record<string, { light: string; dark: string }>;
type Cleanup = () => void;

interface SessionAddress {
  readonly parentSessionId: string;
  readonly childSessionId: string;
  readonly mode: "one-shot" | "continuable";
}

interface SessionSnapshot {
  readonly current?: string;
  readonly currentAddress?: SessionAddress;
  readonly phase: string;
  readonly byId: Readonly<Record<string, unknown>>;
}

interface Sessions {
  readonly list: {
    getSnapshot(): SessionSnapshot;
    subscribe(listener: () => void): Cleanup;
  };
  refresh(): Promise<void>;
  refreshSubagents(parentSessionId: string): Promise<void>;
  open(sessionId: string): void;
  openSubagent(address: SessionAddress): void;
  clear(): void;
}

interface Slots {
  inject(name: string, setup: () => unknown): unknown;
  register(entry: Readonly<Record<string, unknown>>, component: () => unknown): unknown;
}

interface ClientContext {
  readonly theme: { overrideTokens(id: string, tokens: ThemeTokens): Cleanup };
  readonly slots?: Slots;
  readonly sessions?: Sessions;
  effect(setup: () => Cleanup, label: string): unknown;
}

interface ReactRuntime {
  createElement(type: unknown, props?: Readonly<Record<string, unknown>> | null, ...children: unknown[]): unknown;
  useSyncExternalStore<T>(subscribe: (listener: () => void) => Cleanup, snapshot: () => T): T;
}

interface ConnectionRequest {
  readonly id: string;
  readonly origin: string;
}

interface ConnectionGrant {
  readonly id: string;
  readonly origin: string;
}

interface ConnectionsSnapshot {
  readonly pending: readonly ConnectionRequest[];
  readonly grants: readonly ConnectionGrant[];
  readonly error?: string;
}

declare const require: (id: "react") => ReactRuntime;

export const inject = ["theme", "slots", "sessions"];

const clampOpacity = (value: unknown) => Math.min(0.9, Math.max(0.2,
  typeof value === "number" && Number.isFinite(value) ? value : 0.6));
const alpha = (value: number) => Math.round(Math.min(0.98, value) * 100) / 100;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unexpected AgentOnWeb error.";

const chillTokens = (opacity: number): ThemeTokens => ({
  "--dsw-alias-bg-base": { light: `rgba(245, 247, 250, ${alpha(opacity)})`, dark: `rgba(9, 12, 16, ${alpha(opacity)})` },
  "--dsw-alias-bg-layer-1": { light: `rgba(250, 251, 253, ${alpha(opacity + 0.08)})`, dark: `rgba(15, 19, 24, ${alpha(opacity + 0.08)})` },
  "--dsw-alias-bg-layer-2": { light: `rgba(255, 255, 255, ${alpha(opacity + 0.16)})`, dark: `rgba(22, 27, 33, ${alpha(opacity + 0.16)})` },
  "--dsw-alias-bg-overlay": { light: `rgba(255, 255, 255, ${alpha(opacity + 0.28)})`, dark: `rgba(31, 37, 44, ${alpha(opacity + 0.28)})` },
  "--dsw-specific-sidebar-fill": { light: `rgba(238, 242, 247, ${alpha(opacity + 0.02)})`, dark: `rgba(7, 10, 14, ${alpha(opacity + 0.02)})` },
  "--dsw-alias-border-l1": { light: "rgba(15, 23, 42, 0.1)", dark: "rgba(255, 255, 255, 0.09)" },
  "--dsw-alias-border-l2": { light: "rgba(15, 23, 42, 0.16)", dark: "rgba(255, 255, 255, 0.16)" },
});

function syncNativeView(sessions: Sessions): Cleanup {
  let stopped = false;
  let restoring = true;
  let last = "";
  let hydration = 0;
  let writes: Promise<void> = Promise.resolve();
  const selection = () => {
    const state = sessions.list.getSnapshot();
    return state.current ? { sessionId: state.current, ...(state.currentAddress ? { subagentAddress: state.currentAddress } : {}) } : {};
  };
  const save = (value: ReturnType<typeof selection>) => {
    writes = writes.catch(() => {}).then(async () => {
      const response = await fetch("/api/agentonweb/native-view", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value), keepalive: true,
      });
      if (!response.ok) throw new Error("Unable to retain the native DSH view.");
    });
    writes.catch(() => {});
  };
  const restore = async () => {
    const current = ++hydration;
    restoring = true;
    try {
      await writes.catch(() => {});
      await sessions.refresh();
      const before = JSON.stringify(selection());
      const response = await fetch("/api/agentonweb/native-view", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to restore the native DSH view.");
      const body = await response.json() as { selection: { sessionId?: string; subagentAddress?: SessionAddress } | null };
      const bookmark = body.selection;
      if (stopped || current !== hydration) return;
      if (before !== JSON.stringify(selection()) || bookmark === null) save(selection());
      else if (!bookmark.sessionId) sessions.clear();
      else if (bookmark.subagentAddress) {
        await sessions.refreshSubagents(bookmark.subagentAddress.parentSessionId);
        if (!stopped && current === hydration && before === JSON.stringify(selection())) sessions.openSubagent(bookmark.subagentAddress);
      } else if (sessions.list.getSnapshot().byId[bookmark.sessionId]) sessions.open(bookmark.sessionId);
    } catch {
      // A deleted or unavailable native session remains unavailable.
    } finally {
      if (!stopped && current === hydration) { last = JSON.stringify(selection()); restoring = false; }
    }
  };
  const unsubscribe = sessions.list.subscribe(() => {
    if (stopped || restoring || sessions.list.getSnapshot().phase !== "ready") return;
    const value = selection();
    const key = JSON.stringify(value);
    if (key !== last) { last = key; save(value); }
  });
  const onVisible = () => { if (document.visibilityState === "visible") restore(); };
  document.addEventListener("visibilitychange", onVisible);
  // Only the foreground website may reconcile the shared native bookmark.
  // On a runtime restart every partitioned iframe reloads at once; allowing
  // hidden tabs to restore would let stale per-site state win the race.
  if (document.visibilityState === "visible") restore();
  return () => {
    stopped = true;
    hydration++;
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function apply(ctx: ClientContext): void {
  let disposeTheme: Cleanup = () => {};
  let mode: AgentOnWebMode = "chill";
  let opacity = 0.6;
  const fragmentNonce = new URLSearchParams(window.location.hash.slice(1)).get("agentonweb");
  const nonce = fragmentNonce || (typeof window.name === "string" && window.name.startsWith("agentonweb:")
    ? window.name.slice("agentonweb:".length)
    : undefined);

  const applyMode = (nextMode: unknown) => {
    if (nextMode !== "chill" && nextMode !== "focus" && nextMode !== "watch") return;
    mode = nextMode;
    disposeTheme();
    disposeTheme = mode === "focus" ? () => {} : ctx.theme.overrideTokens("agentonweb-surface", chillTokens(opacity));
  };
  const applyOpacity = (nextOpacity: unknown) => {
    opacity = clampOpacity(nextOpacity);
    if (mode !== "focus") applyMode(mode);
  };
  const notifyOptionTap = () => {
    if (!nonce || window.parent === window) return;
    window.parent.postMessage({ source: "agentonweb-surface", type: "site-pass.option-tap", nonce }, "*");
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    if (!nonce || event.source !== window.parent || !event.data || typeof event.data !== "object") return;
    const message = event.data as { source?: unknown; nonce?: unknown; type?: unknown; mode?: unknown; opacity?: unknown };
    if (message.source !== "agentonweb-extension" || message.nonce !== nonce) return;
    if (message.type === "mode.set") applyMode(message.mode);
    if (message.type === "opacity.set") applyOpacity(message.opacity);
  };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Alt" && !event.repeat) notifyOptionTap(); };

  ctx.effect(() => {
    if (nonce && window.parent !== window) applyMode(mode);
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      disposeTheme();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, "agentonweb: transparent surface and double-Option website pass-through");

  if (nonce && window.parent !== window && ctx.sessions) {
    ctx.effect(() => syncNativeView(ctx.sessions!), "agentonweb: native view continuity across websites");
  }

  // Additive native slots only. Authorization is unavailable in website iframes.
  if (window.parent !== window || !ctx.slots) return;
  const React = require("react");
  const h = React.createElement;
  const listeners = new Set<() => void>();
  let snapshot: ConnectionsSnapshot = { pending: [], grants: [] };
  let stopped = false;
  let inFlight = false;
  const publish = (next: ConnectionsSnapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  const refresh = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const response = await fetch("/api/agentonweb/connections", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to read AgentOnWeb connections.");
      const next = await response.json() as ConnectionsSnapshot;
      if (!stopped && JSON.stringify(next) !== JSON.stringify(snapshot)) publish(next);
    } catch (error) {
      if (!stopped) publish({ ...snapshot, error: errorMessage(error) });
    } finally {
      inFlight = false;
    }
  };
  const act = async (action: "allow" | "deny" | "revoke", id: string) => {
    try {
      const response = await fetch("/api/agentonweb/connections", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id }),
      });
      const next = await response.json() as ConnectionsSnapshot & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "Connection request failed.");
      if (!stopped) publish(next);
    } catch (error) {
      if (!stopped) publish({ ...snapshot, error: errorMessage(error) });
    }
  };
  const useConnections = () => React.useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => snapshot,
  );
  const buttonStyle = { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "var(--dsw-alias-bg-layer-2)", color: "inherit" };
  const Pending = ({ request }: { request: ConnectionRequest }) => h("div", { style: { display: "grid", gap: 10 } },
    h("strong", null, "Allow AgentOnWeb to connect?"),
    h("span", null, "This browser extension can use your native DSH workspace, including its coding tools. Only allow a request you initiated."),
    h("code", { style: { overflowWrap: "anywhere", fontSize: 11 } }, request.origin),
    h("div", { style: { display: "flex", gap: 8 } },
      h("button", { style: buttonStyle, onClick: () => act("deny", request.id) }, "Decline"),
      h("button", { style: { ...buttonStyle, background: "#8ee6b7", color: "#092519" }, onClick: () => act("allow", request.id) }, "Allow connection"),
    ),
  );
  const Approval = () => {
    const data = useConnections();
    const pending = data.pending[0];
    if (!pending) return null;
    return h("section", { role: "region", "aria-label": "AgentOnWeb connection authorization", style: {
      pointerEvents: "auto", position: "fixed", right: 24, bottom: 24, width: "min(380px, calc(100vw - 48px))",
      padding: 20, borderRadius: 14, background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-text-primary)",
      border: "1px solid var(--dsw-alias-border-l2)", boxShadow: "0 12px 48px #0004", fontSize: 13,
    } }, h(Pending, { request: pending }), data.error ? h("p", { role: "alert" }, data.error) : null);
  };
  const Connections = () => {
    const data = useConnections();
    return h("section", { style: { display: "grid", gap: 16, padding: 20 } },
      h("h3", null, "AgentOnWeb"),
      h("p", null, "DSH On Web brings this native workspace onto your webpages. Connect from the AgentOnWeb browser extension, then approve it here."),
      data.error ? h("p", { role: "alert" }, data.error) : null,
      ...data.pending.map((request) => h(Pending, { request, key: request.id })),
      data.grants.length ? null : h("p", null, "No authorized browser connections."),
      ...data.grants.map((grant) => h("div", { key: grant.id, style: { display: "grid", gap: 8 } },
        h("code", { style: { overflowWrap: "anywhere", fontSize: 12 } }, grant.origin),
        h("button", { style: buttonStyle, onClick: () => act("revoke", grant.id) }, "Revoke connection"),
      )),
    );
  };
  ctx.slots.inject("shell.overlay", () => ctx.slots!.register(
    { name: "shell.overlay", id: "agentonweb-authorization", order: 100 },
    Approval,
  ));
  ctx.slots.inject("settings.section", () => ctx.slots!.register(
    { name: "settings.section", id: "agentonweb", order: 90, label: "AgentOnWeb" },
    Connections,
  ));
  ctx.effect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { stopped = true; clearInterval(timer); listeners.clear(); };
  }, "agentonweb: native connection approvals");
}
