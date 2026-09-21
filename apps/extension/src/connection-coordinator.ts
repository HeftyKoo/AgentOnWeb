import { isNativeSurface, type NativeSurface, type RuntimeDescriptor } from "@agentonweb/connector-contract";
import {
  ConnectorClient,
  discoverRuntimes,
  type AvailableRuntime,
  type ConnectorCallbacks,
} from "./connector-client.js";
import type { SurfaceConnection } from "./shared.js";

export interface ConnectionView {
  readonly connection: SurfaceConnection;
  readonly runtimeId?: string;
  readonly runtime?: RuntimeDescriptor;
  readonly runtimes?: readonly {
    readonly id: string;
    readonly displayName: string;
  }[];
  readonly approvalUrl?: string;
  readonly nativeUrl?: string;
  readonly nativeOrigins?: readonly string[];
  readonly error?: string;
}

export interface ConnectionSnapshot {
  readonly view: ConnectionView;
  readonly surface?: NativeSurface;
}

interface ConnectorTransport {
  connect(endpoint: string, credential?: string): void;
  request(command: { readonly type: "surface.get" }): Promise<unknown>;
  close(): void;
}

interface ConnectionEffects {
  changed(snapshot: ConnectionSnapshot): void;
  saveCredentials(credentials: Readonly<Record<string, string>>): Promise<void>;
  openApproval(url: string): Promise<void>;
  revokeDelegation(runtimeId: string): Promise<void>;
}

export interface ConnectionCoordinatorOptions {
  readonly effects: ConnectionEffects;
  readonly discover?: () => Promise<AvailableRuntime[]>;
  readonly createTransport?: (callbacks: ConnectorCallbacks) => ConnectorTransport;
}

interface Entry {
  view: ConnectionView;
  surface?: NativeSurface;
  transport: ConnectorTransport;
  generation: number;
}

/** Independent connections; selection never closes another runtime. */
export class ConnectionCoordinator {
  #entries = new Map<string, Entry>();
  #credentials: Record<string, string> = {};
  #activeRuntimeId: string | undefined;
  #available: AvailableRuntime[] = [];
  #fallback: ConnectionView = { connection: "disconnected" };
  #generation = 0;
  #operations: Promise<unknown> = Promise.resolve();
  constructor(readonly options: ConnectionCoordinatorOptions) {}

  get snapshots(): ReadonlyMap<string, ConnectionSnapshot> {
    return new Map(
      [...this.#entries].map(([id, entry]) => [
        id,
        {
          view: entry.view,
          ...(entry.surface ? { surface: entry.surface } : {}),
        },
      ]),
    );
  }
  get snapshot(): ConnectionSnapshot {
    const entry = this.#activeRuntimeId ? this.#entries.get(this.#activeRuntimeId) : undefined;
    const runtimes = new Map(
      this.#available.map((item) => [item.runtime.id, { id: item.runtime.id, displayName: item.runtime.displayName }]),
    );
    const nativeOrigins = new Set(this.#available.map((item) => new URL(item.approvalUrl).origin));
    for (const [id, item] of this.#entries) {
      runtimes.set(id, {
        id,
        displayName: item.view.runtime?.displayName ?? id,
      });
      if (item.surface) {
        nativeOrigins.add(new URL(item.surface.url).origin);
        if (item.view.nativeUrl) nativeOrigins.add(new URL(item.view.nativeUrl).origin);
      }
      if (item.view.connection === "awaiting-approval" && item.view.approvalUrl)
        nativeOrigins.add(new URL(item.view.approvalUrl).origin);
    }
    return {
      view: {
        ...(entry?.view ?? this.#fallback),
        runtimes: [...runtimes.values()],
        nativeOrigins: [...nativeOrigins],
      },
      ...(entry?.surface ? { surface: entry.surface } : {}),
    };
  }
  restore(runtimeId: string | undefined, credentials: Readonly<Record<string, string>>): Promise<void> {
    return this.#enqueue(async () => {
      this.#credentials = { ...credentials };
      this.#activeRuntimeId = runtimeId;
      for (const id of Object.keys(credentials)) await this.#connect(false, id);
      // A persisted choice may belong to a runtime that was revoked/removed.
      // Select only from the connections restored with existing credentials.
      if (!this.#activeRuntimeId || !this.#entries.has(this.#activeRuntimeId))
        this.#activeRuntimeId = this.#entries.keys().next().value;
      this.#emit();
    });
  }
  connect(runtimeId?: string): Promise<void> {
    return this.#enqueue(() => this.#connect(true, runtimeId));
  }
  activate(runtimeId: string): Promise<void> {
    return this.#enqueue(async () => {
      this.#activeRuntimeId = runtimeId;
      const entry = this.#entries.get(runtimeId);
      if (entry?.view.connection === "connected") this.#emit();
      else await this.#connect(true, runtimeId);
    });
  }
  reconnectIfNeeded(): Promise<void> {
    return this.#enqueue(async () => {
      for (const id of Object.keys(this.#credentials)) {
        const state = this.#entries.get(id)?.view.connection;
        if (!state || state === "reconnecting" || state === "disconnected") await this.#connect(false, id);
      }
    });
  }
  showApproval(runtimeId = this.#activeRuntimeId): Promise<void> {
    return this.#enqueue(async () => {
      const url = runtimeId ? this.#entries.get(runtimeId)?.view.approvalUrl : undefined;
      if (url) await this.options.effects.openApproval(url);
    });
  }
  idle(): Promise<void> {
    return this.#operations.then(() => undefined);
  }
  #enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.#operations.catch(() => {}).then(operation);
    this.#operations = next;
    return next;
  }
  async #connect(requestApproval: boolean, selectedId?: string): Promise<void> {
    this.#available = await (this.options.discover ?? discoverRuntimes)();
    const discoveredIds = new Set(this.#available.map((item) => item.runtime.id));
    let removedActive = false;
    for (const [id, entry] of this.#entries) {
      if (discoveredIds.has(id) || entry.view.connection !== "disconnected" || this.#credentials[id]) continue;
      this.#entries.delete(id);
      entry.transport.close();
      if (this.#activeRuntimeId === id) {
        this.#activeRuntimeId = undefined;
        removedActive = true;
      }
    }
    if (removedActive)
      this.#activeRuntimeId = [...this.#entries].find(([, entry]) => entry.view.connection === "connected")?.[0];
    const id = selectedId ?? this.#activeRuntimeId;
    const target =
      this.#available.find((item) => item.runtime.id === id) ??
      (!id && !removedActive && this.#available.length === 1 ? this.#available[0] : undefined);
    if (!target) {
      this.#fallback = {
        connection: "disconnected",
        error: this.#available.length
          ? "Choose a local workspace to connect."
          : "Start the local terminal service with aow service install, or start dsh web, then connect.",
      };
      this.#emit();
      return;
    }
    if (requestApproval || !this.#activeRuntimeId) this.#activeRuntimeId = target.runtime.id;
    const previous = this.#entries.get(target.runtime.id);
    if (previous?.view.connection === "connected" || previous?.view.connection === "awaiting-approval") {
      this.#emit();
      return;
    }
    // Do not reuse a generation if a pruned runtime later reappears with its ID.
    const generation = ++this.#generation;
    // Invalidate old callbacks before closing a transport.
    if (previous) previous.generation = generation;
    previous?.transport.close();
    const runtimeId = target.runtime.id;
    const run = (operation: (entry: Entry) => Promise<void> | void) => {
      void this.#enqueue(async () => {
        const entry = this.#entries.get(runtimeId);
        if (entry?.generation === generation) await operation(entry);
      });
    };
    const transport = (this.options.createTransport ?? ((callbacks) => new ConnectorClient(callbacks)))({
      pending: (url) =>
        run(async (entry) => {
          entry.view = {
            ...entry.view,
            connection: "awaiting-approval",
            approvalUrl: url,
          };
          this.#emit();
          await this.options.effects.openApproval(url);
        }),
      ready: (credential) =>
        run(async (entry) => {
          if (credential) {
            this.#credentials[runtimeId] = credential;
            await this.options.effects.saveCredentials({
              ...this.#credentials,
            });
          }
          try {
            const result = await entry.transport.request({
              type: "surface.get",
            });
            if (!isNativeSurface(result) || result.runtimeId !== runtimeId)
              throw new Error("Invalid native runtime surface.");
            entry.surface = result;
            entry.view = {
              connection: "connected",
              runtimeId,
              runtime: target.runtime,
              nativeUrl: target.approvalUrl,
            };
          } catch (error) {
            delete entry.surface;
            entry.view = {
              ...entry.view,
              connection: "reconnecting",
              error: String(error),
            };
          }
          this.#emit();
        }),
      rejected: (code, message) =>
        run(async (entry) => {
          if (code === "REVOKED" || code === "AUTHENTICATION_FAILED") {
            delete this.#credentials[runtimeId];
            await this.options.effects.saveCredentials({
              ...this.#credentials,
            });
            await this.options.effects.revokeDelegation(runtimeId);
          }
          delete entry.surface;
          entry.view = {
            ...entry.view,
            connection: "disconnected",
            error: message,
          };
          this.#emit();
        }),
      closed: () =>
        run((entry) => {
          delete entry.surface;
          entry.view = {
            ...entry.view,
            connection: this.#credentials[runtimeId] ? "reconnecting" : "disconnected",
          };
          this.#emit();
        }),
    });
    const entry: Entry = {
      generation,
      transport,
      view: {
        connection: requestApproval ? "connecting" : "reconnecting",
        runtimeId,
        runtime: target.runtime,
        nativeUrl: target.approvalUrl,
      },
    };
    this.#entries.set(runtimeId, entry);
    this.#emit();
    transport.connect(target.endpoint, this.#credentials[runtimeId]);
  }
  #emit(): void {
    this.options.effects.changed(this.snapshot);
  }
}
