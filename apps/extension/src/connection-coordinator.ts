import { isNativeSurface, type NativeSurface, type RuntimeDescriptor } from "@overcode/connector-contract";
import { ConnectorClient, discoverRuntimes, type AvailableRuntime, type ConnectorCallbacks } from "./connector-client.js";
import type { SurfaceConnection } from "./shared.js";

export interface ConnectionView {
  readonly connection: SurfaceConnection;
  readonly runtimeId?: string;
  readonly runtime?: RuntimeDescriptor;
  readonly runtimes?: readonly { readonly id: string; readonly displayName: string }[];
  readonly approvalUrl?: string;
  readonly nativeUrl?: string;
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

type ViewPatch = { [K in keyof ConnectionView]?: ConnectionView[K] | undefined };

/** Owns the complete runtime-connection lifecycle behind a command-oriented Interface. */
export class ConnectionCoordinator {
  #view: ConnectionView = { connection: "disconnected" };
  #surface: NativeSurface | undefined;
  #credentials: Record<string, string> = {};
  #activeRuntimeId: string | undefined;
  #available: AvailableRuntime[] = [];
  #retry: ReturnType<typeof setTimeout> | undefined;
  #operations: Promise<unknown> = Promise.resolve();
  readonly #effects: ConnectionEffects;
  readonly #discover: () => Promise<AvailableRuntime[]>;
  readonly #transport: ConnectorTransport;

  constructor(options: ConnectionCoordinatorOptions) {
    this.#effects = options.effects;
    this.#discover = options.discover ?? discoverRuntimes;
    const callbacks: ConnectorCallbacks = {
      pending: (url) => { this.#enqueue(() => this.#pending(url)); },
      ready: (credential) => { this.#enqueue(() => this.#ready(credential)); },
      rejected: (code, message) => { this.#enqueue(() => this.#rejected(code, message)); },
      closed: () => { this.#enqueue(() => this.#closed()); },
    };
    this.#transport = (options.createTransport ?? ((next) => new ConnectorClient(next)))(callbacks);
  }

  get snapshot(): ConnectionSnapshot {
    return { view: { ...this.#view }, ...(this.#surface ? { surface: this.#surface } : {}) };
  }

  restore(runtimeId: string | undefined, credentials: Readonly<Record<string, string>>): Promise<void> {
    return this.#enqueue(async () => {
      this.#credentials = { ...credentials };
      this.#activeRuntimeId = runtimeId;
      this.#patch({ ...(runtimeId ? { runtimeId } : {}) });
      if (runtimeId && this.#credentials[runtimeId]) await this.#connect(false);
    });
  }

  connect(runtimeId?: string): Promise<void> {
    return this.#enqueue(() => this.#connect(true, runtimeId));
  }

  reconnectIfNeeded(): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#activeRuntimeId && this.#credentials[this.#activeRuntimeId] && this.#view.connection === "reconnecting") {
        await this.#connect(false);
      }
    });
  }

  showApproval(): Promise<void> {
    return this.#enqueue(async () => { if (this.#view.approvalUrl) await this.#effects.openApproval(this.#view.approvalUrl); });
  }

  idle(): Promise<void> {
    return this.#operations.then(() => undefined);
  }

  #enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.#operations.catch(() => {}).then(operation);
    this.#operations = result;
    return result;
  }

  async #connect(requestApproval: boolean, selectedId?: string): Promise<void> {
    clearTimeout(this.#retry);
    this.#transport.close();
    this.#setSurface(undefined);
    this.#patch({ connection: requestApproval ? "connecting" : "reconnecting", error: undefined, approvalUrl: undefined });
    this.#available = await this.#discover();
    this.#patch({ runtimes: this.#available.map((item) => ({ id: item.runtime.id, displayName: item.runtime.displayName })) });
    const id = selectedId ?? this.#activeRuntimeId;
    const target = this.#available.find((runtime) => runtime.runtime.id === id)
      ?? (requestApproval && this.#available.length === 1 ? this.#available[0] : undefined);
    if (!target) {
      this.#patch({
        connection: requestApproval ? "disconnected" : "reconnecting",
        error: this.#available.length
          ? "Choose a runtime to connect."
          : "Start your runtime with the Overcode plugin enabled, then connect. For DeepSeek Harness, run dsh web.",
      });
      if (!requestApproval) this.#retry = setTimeout(() => { this.#enqueue(() => this.#connect(false)); }, 5000);
      return;
    }
    this.#activeRuntimeId = target.runtime.id;
    this.#patch({ runtimeId: target.runtime.id, runtime: target.runtime, nativeUrl: target.approvalUrl });
    this.#transport.connect(target.endpoint, this.#credentials[target.runtime.id]);
  }

  async #pending(url: string): Promise<void> {
    this.#patch({ connection: "awaiting-approval", approvalUrl: url, error: undefined });
    await this.#effects.openApproval(url);
  }

  async #ready(credential?: string): Promise<void> {
    const runtimeId = this.#activeRuntimeId;
    if (credential && runtimeId) {
      this.#credentials[runtimeId] = credential;
      await this.#effects.saveCredentials({ ...this.#credentials });
    }
    this.#patch({ connection: "connected", error: undefined, approvalUrl: undefined });
    try {
      const result = await this.#transport.request({ type: "surface.get" });
      if (!isNativeSurface(result) || result.runtimeId !== this.#activeRuntimeId) throw new Error("Invalid native runtime surface.");
      this.#setSurface(result);
      this.#patch({ error: undefined });
    } catch (error) {
      this.#setSurface(undefined);
      this.#patch({ error: error instanceof Error ? error.message : "Native workspace unavailable." });
    }
  }

  async #rejected(code: string, message: string): Promise<void> {
    const runtimeId = this.#activeRuntimeId;
    if ((code === "REVOKED" || code === "AUTHENTICATION_FAILED") && runtimeId) {
      delete this.#credentials[runtimeId];
      await Promise.all([
        this.#effects.saveCredentials({ ...this.#credentials }),
        this.#effects.revokeDelegation(runtimeId),
      ]);
    }
    this.#setSurface(undefined);
    this.#patch({ error: message, approvalUrl: undefined });
  }

  #closed(): void {
    this.#setSurface(undefined);
    const reconnect = Boolean(this.#activeRuntimeId && this.#credentials[this.#activeRuntimeId]);
    this.#patch({ connection: reconnect ? "reconnecting" : "disconnected", approvalUrl: undefined });
    if (reconnect) this.#retry = setTimeout(() => { this.#enqueue(() => this.#connect(false)); }, 3000);
  }

  #setSurface(surface: NativeSurface | undefined): void {
    this.#surface = surface;
    this.#emit();
  }

  #patch(next: ViewPatch): void {
    this.#view = { ...this.#view, ...next } as ConnectionView;
    for (const key of Object.keys(this.#view) as (keyof ConnectionView)[]) {
      if (this.#view[key] === undefined) delete (this.#view as unknown as Record<string, unknown>)[key];
    }
    this.#emit();
  }

  #emit(): void {
    this.#effects.changed(this.snapshot);
  }
}
