import type { NativeSurface, OvercodeMode } from "@overcode/connector-contract";
import { browser, type Browser } from "./browser-api.js";
import { ConnectionCoordinator, type ConnectionView } from "./connection-coordinator.js";
import { DEFAULT_SURFACE_OPACITY, normalizeSurfaceOpacity } from "./interaction.js";
import { PartitionLeaseManager } from "./partition-leases.js";
import { COOKIE_SCOPES_STORAGE_KEY, CREDENTIAL_STORAGE_KEY, STATE_STORAGE_KEY, isContentRequest, type ContentRequest, type StateUpdate, type SurfaceCommand, type SurfaceViewState } from "./shared.js";
import { topLevelSite } from "./surface-cookie.js";

let state: SurfaceViewState = { mode: "chill", opacity: DEFAULT_SURFACE_OPACITY, connection: "disconnected" };
let surface: NativeSurface | undefined;
let publication: Promise<void> = Promise.resolve();
const frameNames = new Map<number, string>();

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

const coordinator = new ConnectionCoordinator({
  effects: {
    changed(snapshot) {
      const previous = surface;
      surface = snapshot.surface;
      if (surface !== previous) leases.invalidate();
      applyConnectionView(snapshot.view);
    },
    async saveCredentials(credentials) {
      await browser.storage.local.set({ [CREDENTIAL_STORAGE_KEY]: credentials });
    },
    openApproval,
    revokeDelegation(runtimeId) {
      return leases.revoke(runtimeId);
    },
  },
});

const initialized = initialize();
browser.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!isContentRequest(message) || sender.id !== browser.runtime.id || sender.frameId !== 0) return false;
  void initialized.then(() => handleRequest(message, sender.tab)).then(
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
  void initialized.then(async () => {
    const mode = command === "mode-chill" ? "chill" : command === "mode-focus" ? "focus" : command === "mode-watch" ? "watch" : undefined;
    if (!mode) return;
    setMode(mode);
    await presentInTab(tab, "surface.show");
  });
});
const toolbarAction = browser.action ?? browser.browserAction;
toolbarAction.onClicked.addListener((tab) => { void initialized.then(() => presentInTab(tab, "surface.toggle")); });
browser.tabs.onRemoved.addListener((id) => frameNames.delete(id));
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "overcode-reconnect") void initialized.then(() => coordinator.reconnectIfNeeded());
});

async function initialize(): Promise<void> {
  if (typeof browser.storage.local.setAccessLevel === "function") {
    await browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
  const stored = await browser.storage.local.get([STATE_STORAGE_KEY, CREDENTIAL_STORAGE_KEY, COOKIE_SCOPES_STORAGE_KEY]);
  leases.restore(stored[COOKIE_SCOPES_STORAGE_KEY]);
  await browser.alarms.create("overcode-reconnect", { periodInMinutes: 0.5 });
  const storedState = stored[STATE_STORAGE_KEY] as Partial<SurfaceViewState> | undefined;
  const saved: unknown = stored[CREDENTIAL_STORAGE_KEY];
  const credentials = saved && typeof saved === "object" && !Array.isArray(saved)
    ? Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  state = {
    ...state,
    mode: storedState?.mode === "focus" || storedState?.mode === "watch" ? storedState.mode : "chill",
    opacity: normalizeSurfaceOpacity(storedState?.opacity),
  };
  await coordinator.restore(storedState?.runtimeId, credentials);
  await coordinator.idle();
  await publication;
}

async function handleRequest(request: ContentRequest, tab?: Browser.tabs.Tab): Promise<unknown> {
  switch (request.type) {
    case "state.get": return viewForTab(tab);
    case "mode.set": setMode(request.mode); return viewForTab(tab);
    case "opacity.set": patch({ opacity: normalizeSurfaceOpacity(request.opacity) }); return viewForTab(tab);
    case "runtime.connect": await coordinator.connect(request.runtimeId); return { ok: true };
    case "runtime.approval": await coordinator.showApproval(); return { ok: true };
  }
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

function setMode(mode: OvercodeMode): void {
  patch({ mode });
}

async function presentInTab(tab: Browser.tabs.Tab | undefined, type: SurfaceCommand["type"]): Promise<void> {
  const target = tab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (target?.id === undefined || !target.url || !topLevelSite(target.url)) return;
  try {
    await browser.tabs.sendMessage(target.id, { source: "overcode-background", type, state: await viewForTab(target) } satisfies SurfaceCommand);
  } catch {
    // Restricted pages and tabs without a content script cannot host Overcode.
  }
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
  void enqueueBroadcast();
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
      source: "overcode-background",
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
  if (!await leases.ensure(tab.id, tab.url, surfaceSnapshot, () => surface === surfaceSnapshot)) return stateSnapshot;
  if (surface !== surfaceSnapshot) return stateSnapshot;
  let frameName = frameNames.get(tab.id);
  if (!frameName) {
    frameName = `overcode:${crypto.randomUUID()}`;
    frameNames.set(tab.id, frameName);
  }
  return { ...stateSnapshot, surface: {
    runtimeId: surfaceSnapshot.runtimeId,
    displayName: surfaceSnapshot.displayName,
    url: surfaceSnapshot.url,
    frameName,
  } };
}
