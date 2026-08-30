import {
  DEFAULT_BRIDGE_ENDPOINT,
  PROTOCOL_VERSION,
  type ClientFrame,
  type HarnessSurface,
  type OvercodeMode,
  type RuntimeCommand,
  type RuntimeCommandResult,
  type ServerFrame,
} from "@overcode/shared-protocol";
import {
  CREDENTIAL_STORAGE_KEY,
  STATE_STORAGE_KEY,
  isContentRequest,
  type ContentRequest,
  type StateUpdate,
  type SurfaceConnection,
  type SurfaceViewState,
} from "./shared.js";
import { surfaceCookieDetails, topLevelSite } from "./surface-cookie.js";

interface BackgroundState {
  readonly mode: OvercodeMode;
  readonly connection: SurfaceConnection;
  readonly paired: boolean;
  readonly endpoint: string;
  readonly error?: string;
}

let state: BackgroundState = {
  mode: "chill",
  connection: "disconnected",
  paired: false,
  endpoint: DEFAULT_BRIDGE_ENDPOINT,
};
let credential: string | undefined;
let surface: HarnessSurface | undefined;
const frameNames = new Map<number, string>();
const installedPartitions = new Set<string>();
let bridge: BridgeClient;

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!isContentRequest(message)) return false;
  void handleRequest(message, sender.tab).then(
    (result) => respond({ ok: true, result }),
    (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      updateState({ error: text });
      respond({ ok: false, error: text, result: { ...state, error: text } });
    },
  );
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "cycle-mode") setMode(nextMode(state.mode));
});

chrome.action.onClicked.addListener(() => {
  setMode(state.mode === "watch" ? "chill" : "watch");
});

chrome.tabs.onRemoved.addListener((tabId) => frameNames.delete(tabId));

async function initialize(): Promise<void> {
  const stored = await chrome.storage.local.get([STATE_STORAGE_KEY, CREDENTIAL_STORAGE_KEY]);
  const storedState = stored[STATE_STORAGE_KEY] as Partial<BackgroundState> | undefined;
  credential = typeof stored[CREDENTIAL_STORAGE_KEY] === "string"
    ? stored[CREDENTIAL_STORAGE_KEY]
    : undefined;
  state = {
    mode: isMode(storedState?.mode) ? storedState.mode : "chill",
    connection: "disconnected",
    paired: Boolean(credential),
    endpoint: storedState?.endpoint ?? DEFAULT_BRIDGE_ENDPOINT,
    ...(storedState?.error ? { error: storedState.error } : {}),
  };
  await persistAndBroadcast();
  if (credential) bridge.connect(state.endpoint, credential);
}

async function handleRequest(request: ContentRequest, tab?: chrome.tabs.Tab): Promise<unknown> {
  switch (request.type) {
    case "state.get":
      return viewStateForTab(tab);
    case "mode.set":
      setMode(request.mode);
      return viewStateForTab(tab);
    case "bridge.pair":
      updateState({ endpoint: request.endpoint, error: undefined, connection: "connecting" });
      bridge.connect(request.endpoint, undefined, request.pairingCode);
      return { ok: true };
  }
}

function setMode(mode: OvercodeMode): void {
  updateState({ mode });
}

function nextMode(mode: OvercodeMode): OvercodeMode {
  return mode === "chill" ? "focus" : mode === "focus" ? "watch" : "chill";
}

type StatePatch = { [Key in keyof BackgroundState]?: BackgroundState[Key] | undefined };

function updateState(patch: StatePatch): void {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  state = { ...state, ...defined };
  if ("error" in patch && patch.error === undefined) {
    const { error: _error, ...withoutError } = state;
    state = withoutError;
  }
  void persistAndBroadcast();
}

async function persistAndBroadcast(): Promise<void> {
  await chrome.storage.local.set({ [STATE_STORAGE_KEY]: state });
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => broadcastToTab(tab)));
}

async function broadcastToTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const update: StateUpdate = {
    source: "overcode-background",
    type: "state.update",
    state: await viewStateForTab(tab),
  };
  await chrome.tabs.sendMessage(tab.id, update);
}

async function viewStateForTab(tab?: chrome.tabs.Tab): Promise<SurfaceViewState> {
  if (!surface || tab?.id === undefined || !tab.url || !topLevelSite(tab.url)) return state;
  const { partitionKey } = await chrome.cookies.getPartitionKey({ tabId: tab.id, frameId: 0 });
  if (!partitionKey.topLevelSite) return state;
  await installSurfaceCookie(surface, partitionKey.topLevelSite);
  let frameName = frameNames.get(tab.id);
  if (!frameName) {
    frameName = `overcode:${crypto.randomUUID()}`;
    frameNames.set(tab.id, frameName);
  }
  return {
    ...state,
    surface: {
      runtimeId: surface.runtimeId,
      displayName: surface.displayName,
      url: surface.url,
      frameName,
    },
  };
}

async function installSurfaceCookie(nextSurface: HarnessSurface, partitionSite: string): Promise<void> {
  const details = surfaceCookieDetails(nextSurface, partitionSite);
  if (!details) return;
  const cacheKey = `${details.name}\n${details.partitionKey.topLevelSite}`;
  if (installedPartitions.has(cacheKey)) return;
  const installed = await chrome.cookies.set(details);
  if (!installed) throw new Error("Chrome refused the isolated DeepSeek Harness browser session.");
  installedPartitions.add(cacheKey);
}

async function refreshSurface(): Promise<void> {
  try {
    const result = await bridge.request({ type: "surface.get" });
    if (!isHarnessSurface(result)) throw new Error("The bridge returned an invalid Harness surface.");
    surface = result;
    installedPartitions.clear();
    updateState({ error: undefined });
  } catch (error) {
    surface = undefined;
    updateState({ error: error instanceof Error ? error.message : "DeepSeek Harness Web UI is unavailable." });
  }
}

function isHarnessSurface(value: RuntimeCommandResult): value is HarnessSurface {
  return "runtimeId" in value && "url" in value && "cookie" in value;
}

interface BridgeCallbacks {
  readonly onConnection: (state: SurfaceConnection) => void;
  readonly onPaired: (credential: string) => void;
  readonly onError: (message: string) => void;
}

class BridgeClient {
  readonly #callbacks: BridgeCallbacks;
  readonly #pending = new Map<string, {
    resolve: (value: RuntimeCommandResult) => void;
    reject: (error: Error) => void;
  }>();
  #socket: WebSocket | undefined;
  #endpoint = DEFAULT_BRIDGE_ENDPOINT;
  #credential: string | undefined;
  #reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  #heartbeatTimer: ReturnType<typeof globalThis.setInterval> | undefined;
  #ready = false;

  constructor(callbacks: BridgeCallbacks) {
    this.#callbacks = callbacks;
  }

  connect(endpoint: string, nextCredential?: string, pairingCode?: string): void {
    this.#endpoint = endpoint;
    this.#credential = nextCredential;
    this.#ready = false;
    this.#clearTimers();
    this.#socket?.close(1000, "Reconnecting");
    this.#callbacks.onConnection("connecting");
    const socket = new WebSocket(endpoint);
    this.#socket = socket;
    socket.addEventListener("open", () => {
      const hello: ClientFrame = {
        kind: "hello",
        protocolVersion: PROTOCOL_VERSION,
        clientNonce: crypto.randomUUID(),
        ...(nextCredential ? { credential: nextCredential } : {}),
        ...(pairingCode ? { pairingCode } : {}),
      };
      socket.send(JSON.stringify(hello));
    });
    socket.addEventListener("message", (event) => this.#handleMessage(event.data));
    socket.addEventListener("error", () => this.#callbacks.onError("Cannot reach the local Overcode bridge."));
    socket.addEventListener("close", (event) => this.#handleClose(event));
  }

  request(command: RuntimeCommand): Promise<RuntimeCommandResult> {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || !this.#ready) {
      return Promise.reject(new Error("The local bridge is not connected."));
    }
    const id = crypto.randomUUID();
    const frame: ClientFrame = { kind: "request", id, command };
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket?.send(JSON.stringify(frame));
    });
  }

  #handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let frame: ServerFrame;
    try {
      frame = JSON.parse(data) as ServerFrame;
    } catch {
      this.#callbacks.onError("The bridge sent an invalid protocol frame.");
      return;
    }
    if (frame.kind === "hello") {
      if (frame.protocolVersion !== PROTOCOL_VERSION || !frame.paired) {
        this.#callbacks.onError("The bridge protocol is incompatible or not paired.");
        return;
      }
      this.#ready = true;
      if (frame.credential) {
        this.#credential = frame.credential;
        this.#callbacks.onPaired(frame.credential);
      }
      this.#callbacks.onConnection("connected");
      this.#heartbeatTimer = globalThis.setInterval(() => {
        void this.request({ type: "connection.ping" }).catch(() => undefined);
      }, 20_000);
      return;
    }
    if (frame.kind === "error") {
      this.#callbacks.onError(frame.message);
      this.#socket?.close(4001, frame.code);
      return;
    }
    const pending = this.#pending.get(frame.id);
    if (!pending) return;
    this.#pending.delete(frame.id);
    if (frame.ok && frame.result) pending.resolve(frame.result);
    else pending.reject(new Error(frame.error?.message ?? "Bridge request failed."));
  }

  #handleClose(event: CloseEvent): void {
    this.#ready = false;
    this.#clearTimers();
    for (const pending of this.#pending.values()) pending.reject(new Error("The bridge disconnected."));
    this.#pending.clear();
    surface = undefined;
    if (event.code === 1000 || !this.#credential) {
      this.#callbacks.onConnection("disconnected");
      return;
    }
    this.#callbacks.onConnection("reconnecting");
    this.#reconnectTimer = globalThis.setTimeout(() => this.connect(this.#endpoint, this.#credential), 1_500);
  }

  #clearTimers(): void {
    if (this.#reconnectTimer !== undefined) globalThis.clearTimeout(this.#reconnectTimer);
    if (this.#heartbeatTimer !== undefined) globalThis.clearInterval(this.#heartbeatTimer);
    this.#reconnectTimer = undefined;
    this.#heartbeatTimer = undefined;
  }
}

bridge = new BridgeClient({
  onConnection(connection) {
    updateState({ connection });
    if (connection === "connected") void refreshSurface();
  },
  onPaired(nextCredential) {
    credential = nextCredential;
    void chrome.storage.local.set({ [CREDENTIAL_STORAGE_KEY]: nextCredential });
    updateState({ paired: true, error: undefined });
  },
  onError(message) {
    updateState({ error: message });
  },
});

function isMode(value: unknown): value is OvercodeMode {
  return value === "chill" || value === "focus" || value === "watch";
}

void initialize();
