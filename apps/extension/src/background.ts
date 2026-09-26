import type { NativeSurface, AgentOnWebMode } from "@agentonweb/connector-contract";
import { browser, extensionURL, type Browser } from "./browser-api.js";
import { ConnectionCoordinator, type ConnectionView } from "./connection-coordinator.js";
import { HeaderLeaseManager } from "./header-leases.js";
import { DEFAULT_SURFACE_OPACITY, normalizeSurfaceOpacity } from "./interaction.js";
import { PartitionLeaseManager } from "./partition-leases.js";
import { SafariCookieLeaseManager } from "./safari-cookie-leases.js";
import { COOKIE_SCOPES_STORAGE_KEY, CREDENTIAL_STORAGE_KEY, STATE_STORAGE_KEY, isContentRequest, type ContentRequest, type StateUpdate, type SurfaceCommand, type SurfaceViewState } from "./shared.js";
import { topLevelSite } from "./surface-cookie.js";

let state: SurfaceViewState = { mode: "chill", opacity: DEFAULT_SURFACE_OPACITY, connection: "disconnected" };
let surface: NativeSurface | undefined;
let publication: Promise<void> = Promise.resolve();
const frameNames = new Map<number, string>();
const safariSetupVisits = new Map<string, { returnTabId: number; visitTabId: number }>();
const targetBrowser = import.meta.env.BROWSER ?? "chrome";
const SAFARI_COOKIE_SCOPES = "agentonweb.safari-cookie-scopes";
const safariCookies = new SafariCookieLeaseManager({
  async set(details) { return Boolean(await browser.cookies.set(details)); },
  async remove(details) { await browser.cookies.remove(details); },
  async persist(scopes) { await browser.storage.local.set({ [SAFARI_COOKIE_SCOPES]: scopes }); },
});

const leases = new PartitionLeaseManager({
  async partition(tabId, pageUrl) {
    if (typeof browser.cookies.getPartitionKey !== "function") return topLevelSite(pageUrl);
    const { partitionKey } = await browser.cookies.getPartitionKey({ tabId, frameId: 0 });
    return partitionKey.topLevelSite;
  },
  async set(details) {
    return Boolean(await browser.cookies.set(details));
  },
  async remove(details) {
    await browser.cookies.remove(details);
  },
  async persist(scopes) {
    await browser.storage.local.set({ [COOKIE_SCOPES_STORAGE_KEY]: scopes });
  },
});
const sessionLeases = targetBrowser !== "firefox"
  ? new HeaderLeaseManager({
      getSessionRules() { return browser.declarativeNetRequest.getSessionRules(); },
      updateSessionRules(update) {
        type SessionRuleUpdate = Parameters<typeof browser.declarativeNetRequest.updateSessionRules>[0];
        return browser.declarativeNetRequest.updateSessionRules(update as unknown as SessionRuleUpdate);
      },
    })
  : leases;

const coordinator = new ConnectionCoordinator({
  effects: {
    changed(snapshot) {
      const previous = surface;
      surface = snapshot.surface;
      if (surface !== previous) {
        sessionLeases.invalidate();
        if (targetBrowser === "chrome") leases.invalidate();
        if (targetBrowser === "safari") safariCookies.invalidate();
      }
      applyConnectionView(snapshot.view);
    },
    async saveCredentials(credentials) {
      await browser.storage.local.set({ [CREDENTIAL_STORAGE_KEY]: credentials });
    },
    openApproval,
    async revokeDelegation(runtimeId) {
      await sessionLeases.revoke(runtimeId);
      // Chrome owns both the HTTP header lease and partitioned cookie lease.
      if (targetBrowser === "chrome") await leases.revoke(runtimeId);
      if (targetBrowser === "safari") await safariCookies.revoke(runtimeId);
    },
  },
});

const initialized = initialize();
browser.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id === browser.runtime.id
    && message && typeof message === "object" && "source" in message && message.source === "agentonweb-popup"
    && "type" in message && message.type === "surface.toggle" && sender.url === extensionURL("/popup.html")) {
    initialized.then(() => presentInTab(undefined, "surface.toggle")).then(
      ok => respond({ ok }), () => respond({ ok: false }),
    );
    return true;
  }
  if (targetBrowser === "safari" && sender.id === browser.runtime.id
    && message && typeof message === "object" && "source" in message && message.source === "agentonweb-safari-session") {
    initialized.then(() => handleSafariSession(message, sender)).then(
      (result) => respond({ ok: true, result }),
      () => respond({ ok: false }),
    );
    return true;
  }
  if (!isContentRequest(message) || sender.id !== browser.runtime.id || sender.frameId !== 0) return false;
  const permission = targetBrowser === "safari" && message.type === "runtime.connect"
    ? browser.permissions.contains({ origins: ["http://localhost/*", "http://127.0.0.1/*"] }) : Promise.resolve(true);
  permission.then(async (allowed) => {
    if (!allowed) throw new Error("Click the AgentOnWeb toolbar button and allow local workspace access, then connect again.");
    await initialized;
    return handleRequest(message, sender.tab);
  }).then(
    (result) => respond({ ok: true, result }),
    (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      patch({ error: text });
      respond({ ok: false, error: text });
    },
  );
  return true;
});
browser.commands.onCommand.addListener((command, tab) => {
  initialized.then(async () => {
    const mode = command === "mode-chill" ? "chill" : command === "mode-focus" ? "focus" : command === "mode-watch" ? "watch" : undefined;
    if (!mode) return;
    setMode(mode);
    await presentInTab(tab, "surface.show");
  });
});
const toolbarAction = browser.action ?? browser.browserAction;
toolbarAction.onClicked.addListener((tab) => {
  // Safari does not carry a content-script click through runtime.sendMessage.
  // Its toolbar gesture is the supported place to request loopback access.
  const permission = targetBrowser === "safari"
    ? browser.permissions.request({ origins: ["http://localhost/*", "http://127.0.0.1/*"] }) : Promise.resolve(true);
  permission.then(async (allowed) => {
    await initialized;
    if (!allowed) {
      patch({ error: "Allow local workspace access from the AgentOnWeb toolbar to connect." });
      return;
    }
    await presentInTab(tab, "surface.toggle");
  }).catch((error: unknown) => patch({ error: error instanceof Error ? error.message : String(error) }));
});
browser.tabs.onRemoved.addListener((id) => {
  frameNames.delete(id);
  if (targetBrowser !== "firefox") (sessionLeases as HeaderLeaseManager).removeTab(id);
});
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "agentonweb-reconnect") initialized.then(() => coordinator.reconnectIfNeeded());
});

async function initialize(): Promise<void> {
  if (targetBrowser !== "firefox") await (sessionLeases as HeaderLeaseManager).reset();
  if (typeof browser.storage.local.setAccessLevel === "function") {
    await browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
  const stored = await browser.storage.local.get([STATE_STORAGE_KEY, CREDENTIAL_STORAGE_KEY, COOKIE_SCOPES_STORAGE_KEY, SAFARI_COOKIE_SCOPES]);
  leases.restore(stored[COOKIE_SCOPES_STORAGE_KEY]);
  if (targetBrowser === "safari") safariCookies.restore(stored[SAFARI_COOKIE_SCOPES]);
  await browser.alarms.create("agentonweb-reconnect", { periodInMinutes: 0.5 });
  const storedState = stored[STATE_STORAGE_KEY] as Partial<SurfaceViewState> | undefined;
  const saved: unknown = stored[CREDENTIAL_STORAGE_KEY];
  const credentials = saved && typeof saved === "object" && !Array.isArray(saved)
    ? Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  state = {
    ...state,
    mode: storedState?.mode === "watch" || storedState?.mode === "focus" ? storedState.mode : "chill",
    dismissed: storedState?.dismissed === true,
    opacity: normalizeSurfaceOpacity(storedState?.opacity),
  };
  await coordinator.restore(storedState?.runtimeId, credentials);
  await coordinator.idle();
  await publication;
}

async function handleRequest(request: ContentRequest, tab?: Browser.tabs.Tab): Promise<unknown> {
  switch (request.type) {
    case "state.get": return viewForTab(tab);
    case "visibility.set":
      patch({ dismissed: !request.visible });
      await publication;
      return { ok: true };
    case "mode.set": setMode(request.mode); return viewForTab(tab);
    case "opacity.set": patch({ opacity: normalizeSurfaceOpacity(request.opacity) }); return viewForTab(tab);
    case "runtime.connect": await coordinator.connect(request.runtimeId); return { ok: true };
    case "runtime.approval": await coordinator.showApproval(); return { ok: true };
  }
}

async function handleSafariSession(message: object, sender: Browser.runtime.MessageSender): Promise<unknown> {
  const request = message as { type?: unknown; nonce?: unknown };
  if (typeof request.nonce !== "string" || !surface || sender.tab?.id === undefined || !sender.url) throw new Error("Invalid session.");
  const url = new URL(sender.url);
  const nativeUrl = new URL(surface.url);
  if (url.origin !== nativeUrl.origin || url.pathname !== "/" || url.search) throw new Error("Invalid session origin.");
  if (sender.frameId === 0) {
    const visit = safariSetupVisits.get(request.nonce);
    if (!visit || visit.visitTabId !== sender.tab.id
      || new URLSearchParams(url.hash.slice(1)).get("agentonweb-safari-setup") !== request.nonce) throw new Error("Invalid setup visit.");
    if (request.type === "session.is-visit") return true;
    if (request.type === "session.return") {
      safariSetupVisits.delete(request.nonce);
      await browser.tabs.update(visit.returnTabId, { active: true });
      return true;
    }
    throw new Error("Invalid setup request.");
  }
  if (frameNames.get(sender.tab.id) !== `agentonweb:${request.nonce}`
    || new URLSearchParams(url.hash.slice(1)).get("agentonweb") !== request.nonce) throw new Error("Invalid frame.");
  if (request.type === "session.prepare") return { nativeUrl: surface.url };
  if (request.type === "session.visit") {
    const visitUrl = new URL(surface.url);
    visitUrl.hash = new URLSearchParams({ "agentonweb-safari-setup": request.nonce }).toString();
    const tab = await browser.tabs.create({ url: visitUrl.href });
    if (tab.id === undefined) throw new Error("Unable to open local workspace.");
    safariSetupVisits.set(request.nonce, { returnTabId: sender.tab.id, visitTabId: tab.id });
    return true;
  }
  throw new Error("Invalid session request.");
}

async function openApproval(url: string): Promise<void> {
  const tabs = await browser.tabs.query({});
  const found = tabs.find((tab) => tab.url?.startsWith(url));
  if (found?.id !== undefined) {
    await browser.tabs.update(found.id, { active: true });
    if (found.windowId) await browser.windows.update(found.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url });
  }
}

function setMode(mode: AgentOnWebMode): void {
  patch({ mode });
}

async function presentInTab(tab: Browser.tabs.Tab | undefined, type: SurfaceCommand["type"]): Promise<boolean> {
  const target = tab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (target?.id !== undefined && target.url && topLevelSite(target.url)) {
    try {
      await browser.tabs.sendMessage(target.id, { source: "agentonweb-background", type, state: await viewForTab(target) } satisfies SurfaceCommand);
      return true;
    } catch {
      // Explain unavailable page access instead of silently swallowing the click.
    }
  }
  if (targetBrowser === "safari") await browser.tabs.create({ url: extensionURL("/demo.html") });
  return false;
}

function applyConnectionView(view: ConnectionView): void {
  patch({
    connection: view.connection,
    runtimeId: view.runtimeId,
    runtime: view.runtime,
    runtimes: view.runtimes,
    approvalUrl: view.approvalUrl,
    nativeUrl: view.nativeUrl,
    error: view.error,
  });
}

type StatePatch = { [K in keyof SurfaceViewState]?: SurfaceViewState[K] | undefined };
function patch(next: StatePatch): void {
  state = { ...state, ...next } as SurfaceViewState;
  for (const key of Object.keys(state) as (keyof SurfaceViewState)[]) {
    if (state[key] === undefined) delete (state as unknown as Record<string, unknown>)[key];
  }
  enqueueBroadcast();
}

function enqueueBroadcast(): Promise<void> {
  const stateSnapshot = { ...state };
  const surfaceSnapshot = surface;
  const next = publication.catch(() => {}).then(() => broadcast(stateSnapshot, surfaceSnapshot));
  publication = next;
  return next;
}

async function broadcast(stateSnapshot: SurfaceViewState, surfaceSnapshot?: NativeSurface): Promise<void> {
  await browser.storage.local.set({ [STATE_STORAGE_KEY]: stateSnapshot });
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs.map(async (tab) => {
    if (tab.id === undefined) return;
    await browser.tabs.sendMessage(tab.id, {
      source: "agentonweb-background",
      type: "state.update",
      state: await viewForTab(tab, stateSnapshot, surfaceSnapshot),
    } satisfies StateUpdate);
  }));
}

async function viewForTab(
  tab?: Browser.tabs.Tab,
  stateSnapshot: SurfaceViewState = state,
  surfaceSnapshot: NativeSurface | undefined = surface,
): Promise<SurfaceViewState> {
  if (!surfaceSnapshot || tab?.id === undefined || !tab.url || !topLevelSite(tab.url)) return stateSnapshot;
  if (targetBrowser === "safari" && !await safariCookies.ensure(surfaceSnapshot, () => surface === surfaceSnapshot)) return stateSnapshot;
  // Native WebSocket handshakes still need the partitioned cookie in Chromium.
  // The header lease prevents old first-party cookies shadowing it on HTTP.
  if (targetBrowser === "chrome" && !await leases.ensure(tab.id, tab.url, surfaceSnapshot, () => surface === surfaceSnapshot)) return stateSnapshot;
  if (!await sessionLeases.ensure(tab.id, tab.url, surfaceSnapshot, () => surface === surfaceSnapshot)) return stateSnapshot;
  if (surface !== surfaceSnapshot) return stateSnapshot;
  let frameName = frameNames.get(tab.id);
  if (!frameName) {
    frameName = `agentonweb:${crypto.randomUUID()}`;
    frameNames.set(tab.id, frameName);
  }
  return { ...stateSnapshot, surface: {
    runtimeId: surfaceSnapshot.runtimeId,
    displayName: surfaceSnapshot.displayName,
    url: surfaceSnapshot.url,
    frameName,
  } };
}
