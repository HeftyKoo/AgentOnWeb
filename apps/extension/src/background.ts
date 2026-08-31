import type { NativeSurface, OvercodeMode } from "@overcode/shared-protocol";
import { ConnectorClient, discoverRuntimes, isNativeSurface, type AvailableRuntime } from "./connector-client.js";
import { DEFAULT_SURFACE_OPACITY, normalizeSurfaceOpacity } from "./interaction.js";
import { CREDENTIAL_STORAGE_KEY, STATE_STORAGE_KEY, isContentRequest, type ContentRequest, type StateUpdate, type SurfaceViewState } from "./shared.js";
import { surfaceCookieDetails, topLevelSite } from "./surface-cookie.js";

let state: SurfaceViewState = { mode: "chill", opacity: DEFAULT_SURFACE_OPACITY, connection: "disconnected", paired: false, endpoint: "" };
let credentials: Record<string, string> = {};
let activeRuntimeId: string | undefined;
let surface: NativeSurface | undefined;
let available: AvailableRuntime[] = [];
let retry: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
const frameNames = new Map<number, string>();
const installedPartitions = new Map<string, { url: string; name: string; partitionKey: chrome.cookies.CookiePartitionKey }>();
const COOKIE_SCOPES_KEY = "overcode.cookie-scopes.v3";
type CookieScope = { runtimeId: string; url: string; name: string; partitionKey: chrome.cookies.CookiePartitionKey };
const cookieScopes = new Map<string, CookieScope>();

const client = new ConnectorClient({
  pending(url) {
    patch({ connection: "awaiting-approval", approvalUrl: url, error: undefined });
    void openApproval(url);
  },
  ready(credential) {
    if (credential && activeRuntimeId) {
      credentials[activeRuntimeId] = credential;
      void chrome.storage.local.set({ [CREDENTIAL_STORAGE_KEY]: credentials });
    }
    patch({ connection: "connected", paired: true, error: undefined, approvalUrl: undefined });
    void refreshSurface();
  },
  rejected(code, message) {
    if (["REVOKED", "AUTHENTICATION_FAILED"].includes(code) && activeRuntimeId) {
      delete credentials[activeRuntimeId];
      void chrome.storage.local.set({ [CREDENTIAL_STORAGE_KEY]: credentials });
      void clearCookies();
    }
    surface = undefined;
    patch({ error: message, paired: Boolean(activeRuntimeId && credentials[activeRuntimeId]), approvalUrl: undefined });
  },
  closed() {
    surface = undefined;
    const reconnect = Boolean(activeRuntimeId && credentials[activeRuntimeId]);
    patch({ connection: reconnect ? "reconnecting" : "disconnected", approvalUrl: undefined });
    if (reconnect) retry = setTimeout(() => { void connect(false); }, 3000);
  },
});

const initialized = initialize();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!isContentRequest(message) || sender.id !== chrome.runtime.id || sender.frameId !== 0) return false;
  void initialized.then(() => handleRequest(message, sender.tab)).then(
    (result) => respond({ ok: true, result }),
    (error: unknown) => { const text = error instanceof Error ? error.message : String(error); patch({ error: text }); respond({ ok: false, error: text }); },
  );
  return true;
});
chrome.commands.onCommand.addListener((command) => {
  void initialized.then(() => { if (command === "mode-chill") setMode("chill"); if (command === "mode-focus") setMode("focus"); if (command === "mode-watch") setMode("watch"); });
});
chrome.action.onClicked.addListener(() => { void initialized.then(() => setMode(state.mode === "watch" ? "chill" : "watch")); });
chrome.tabs.onRemoved.addListener((id) => frameNames.delete(id));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "overcode-reconnect") return;
  void initialized.then(() => { if (state.paired && state.connection === "reconnecting") void connect(false); });
});

async function initialize(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const stored = await chrome.storage.local.get([STATE_STORAGE_KEY, CREDENTIAL_STORAGE_KEY, COOKIE_SCOPES_KEY]);
  const scopes = stored[COOKIE_SCOPES_KEY] as CookieScope[] | undefined;
  for (const scope of Array.isArray(scopes) ? scopes : []) {
    if (typeof scope.runtimeId === "string" && typeof scope.url === "string" && typeof scope.name === "string" && typeof scope.partitionKey?.topLevelSite === "string") {
      cookieScopes.set(`${scope.name}\n${scope.partitionKey.topLevelSite}`, scope);
    }
  }
  // MV3 may suspend the worker while DSH is stopped. A timer alone cannot wake it.
  await chrome.alarms.create("overcode-reconnect", { periodInMinutes: 0.5 });
  const previous = stored[STATE_STORAGE_KEY] as Partial<SurfaceViewState> | undefined;
  const saved: unknown = stored[CREDENTIAL_STORAGE_KEY];
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    credentials = Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  }
  activeRuntimeId = previous?.runtimeId;
  state = { ...state, mode: previous?.mode === "focus" || previous?.mode === "watch" ? previous.mode : "chill",
    opacity: normalizeSurfaceOpacity(previous?.opacity), ...(activeRuntimeId ? { runtimeId: activeRuntimeId } : {}), paired: Boolean(activeRuntimeId && credentials[activeRuntimeId]) };
  await broadcast();
  if (state.paired) void connect(false);
}

async function handleRequest(request: ContentRequest, tab?: chrome.tabs.Tab): Promise<unknown> {
  switch (request.type) {
    case "state.get": return viewForTab(tab);
    case "mode.set": setMode(request.mode); return viewForTab(tab);
    case "opacity.set": patch({ opacity: normalizeSurfaceOpacity(request.opacity) }); return viewForTab(tab);
    case "runtime.connect": await connect(true, request.runtimeId); return { ok: true };
    case "runtime.approval": if (state.approvalUrl) await openApproval(state.approvalUrl); return { ok: true };
  }
}

async function connect(requestApproval: boolean, selectedId?: string): Promise<void> {
  clearTimeout(retry);
  const current = ++generation;
  client.close(); surface = undefined;
  patch({ connection: requestApproval ? "connecting" : "reconnecting", error: undefined, approvalUrl: undefined });
  available = await discoverRuntimes();
  if (current !== generation) return;
  patch({ runtimes: available.map((item) => ({ id: item.runtime.id, displayName: item.runtime.displayName })) });
  const id = selectedId ?? activeRuntimeId;
  const target = available.find((r) => r.runtime.id === id) ?? (requestApproval && available.length === 1 ? available[0] : undefined);
  if (!target) {
    patch({ connection: requestApproval ? "disconnected" : "reconnecting", error: available.length ? "Choose a runtime to connect." : "Start your runtime with the Overcode plugin enabled, then connect. For DeepSeek Harness, run dsh web." });
    if (!requestApproval) retry = setTimeout(() => { void connect(false); }, 5000);
    return;
  }
  activeRuntimeId = target.runtime.id;
  patch({ runtimeId: activeRuntimeId, runtime: target.runtime, nativeUrl: target.approvalUrl, endpoint: target.endpoint, paired: Boolean(credentials[activeRuntimeId]) });
  client.connect(target.endpoint, credentials[activeRuntimeId]);
}

async function openApproval(url: string): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const found = tabs.find((tab) => tab.url?.startsWith(url));
  if (found?.id !== undefined) { await chrome.tabs.update(found.id, { active: true }); if (found.windowId) await chrome.windows.update(found.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
}

function setMode(mode: OvercodeMode): void { patch({ mode }); }
type StatePatch = { [K in keyof SurfaceViewState]?: SurfaceViewState[K] | undefined };
function patch(next: StatePatch): void {
  state = { ...state, ...next } as SurfaceViewState;
  for (const key of Object.keys(state) as (keyof SurfaceViewState)[]) if (state[key] === undefined) delete (state as unknown as Record<string, unknown>)[key];
  void broadcast();
}

async function broadcast(): Promise<void> {
  await chrome.storage.local.set({ [STATE_STORAGE_KEY]: state });
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(async (tab) => {
    if (tab.id === undefined) return;
    await chrome.tabs.sendMessage(tab.id, { source: "overcode-background", type: "state.update", state: await viewForTab(tab) } satisfies StateUpdate);
  }));
}

async function viewForTab(tab?: chrome.tabs.Tab): Promise<SurfaceViewState> {
  const currentSurface = surface;
  if (!currentSurface || tab?.id === undefined || !tab.url || !topLevelSite(tab.url)) return state;
  const { partitionKey } = await chrome.cookies.getPartitionKey({ tabId: tab.id, frameId: 0 });
  if (!partitionKey.topLevelSite) return state;
  const details = surfaceCookieDetails(currentSurface, partitionKey.topLevelSite);
  if (details) {
    const key = `${details.name}\n${details.partitionKey.topLevelSite}`;
    if (!installedPartitions.has(key)) {
      const cookie = await chrome.cookies.set(details);
      if (!cookie) throw new Error("Chrome refused the isolated native runtime session.");
      if (surface !== currentSurface) { await chrome.cookies.remove(details); return state; }
      installedPartitions.set(key, { url: details.url, name: details.name, partitionKey: details.partitionKey });
      cookieScopes.set(key, { runtimeId: currentSurface.runtimeId, url: details.url, name: details.name, partitionKey: details.partitionKey });
      await chrome.storage.local.set({ [COOKIE_SCOPES_KEY]: [...cookieScopes.values()] });
    }
  }
  if (surface !== currentSurface) return state;
  let frameName = frameNames.get(tab.id);
  if (!frameName) { frameName = `overcode:${crypto.randomUUID()}`; frameNames.set(tab.id, frameName); }
  return { ...state, surface: { runtimeId: currentSurface.runtimeId, displayName: currentSurface.displayName, url: currentSurface.url, frameName } };
}

async function clearCookies(): Promise<void> {
  const scopes = [...cookieScopes.entries()].filter(([, scope]) => scope.runtimeId === activeRuntimeId);
  await Promise.allSettled(scopes.map(async ([key, { runtimeId: _runtimeId, ...details }]) => {
    await chrome.cookies.remove(details); cookieScopes.delete(key);
  }));
  installedPartitions.clear();
  await chrome.storage.local.set({ [COOKIE_SCOPES_KEY]: [...cookieScopes.values()] });
}

async function refreshSurface(): Promise<void> {
  try {
    const result = await client.request({ type: "surface.get" });
    if (!isNativeSurface(result) || result.runtimeId !== activeRuntimeId) throw new Error("Invalid native runtime surface.");
    surface = result; installedPartitions.clear(); patch({ error: undefined });
  } catch (error) { surface = undefined; patch({ error: error instanceof Error ? error.message : "Native workspace unavailable." }); }
}
