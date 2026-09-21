import { randomUUID } from "node:crypto";
import { spawn, type IPty } from "node-pty";
import headless from "@xterm/headless";
import serialize from "@xterm/addon-serialize";

export interface Viewer { send(message: object): void; close(): void }
interface Client { viewer: Viewer; outstanding: Map<number, number>; bytes: number; ready: boolean }

/** A process belongs to the host, never to a browser connection. */
export class TerminalSession {
  readonly epoch = randomUUID();
  readonly pty: IPty;
  readonly terminal = new headless.Terminal({ cols: 100, rows: 30, scrollback: 3000, allowProposedApi: true });
  readonly serializer = new serialize.SerializeAddon();
  #clients = new Map<string, Client>();
  #controller: string | undefined;
  #lease = 0;
  #sequence = 0;
  #pendingBytes = 0;
  #exited: number | undefined;

  constructor(executable: string, args: string[], cwd: string, env: Record<string, string>) {
    this.terminal.loadAddon(this.serializer);
    this.pty = spawn(executable, args, { cwd, env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" }, name: "xterm-256color", cols: 100, rows: 30 });
    // Device queries are answered once by the canonical terminal, even without a viewer.
    this.terminal.onData(data => { if (this.#exited === undefined) this.pty.write(data); });
    this.pty.onData(data => {
      this.#pendingBytes += data.length;
      if (this.#pendingBytes > 256_000) this.pty.pause();
      this.terminal.write(data, () => {
        this.#pendingBytes -= data.length;
        if (this.#pendingBytes < 64_000 && this.#exited === undefined) this.pty.resume();
        const sequence = ++this.#sequence;
        for (const [id, client] of this.#clients) {
          if (!client.ready) continue;
          if (client.bytes + data.length > 512_000) { this.detach(id); client.viewer.close(); continue; }
          client.bytes += data.length;
          client.outstanding.set(sequence, data.length);
          client.viewer.send({ type: "output", epoch: this.epoch, sequence, data });
        }
      });
    });
    this.pty.onExit(({ exitCode }) => { this.#exited = exitCode; this.#broadcast({ type: "exit", code: exitCode }); });
  }

  attach(viewer: Viewer): string {
    const id = randomUUID();
    // Flush the canonical parser before snapshotting and registering live output.
    this.terminal.write("", () => {
      if (!this.#clients.has(id)) return;
      viewer.send({ type: "snapshot", epoch: this.epoch, sequence: this.#sequence,
        cols: this.terminal.cols, rows: this.terminal.rows, data: this.serializer.serialize(), exitCode: this.#exited });
      this.#clients.get(id)!.ready = true;
      // An unowned terminal is ready to type immediately. Existing writers
      // are never displaced by opening another browser view.
      if (!this.#controller && this.#exited === undefined) { this.#controller = id; ++this.#lease; }
      this.#state();
    });
    this.#clients.set(id, { viewer, outstanding: new Map(), bytes: 0, ready: false });
    return id;
  }

  detach(id: string): void {
    this.#clients.delete(id);
    if (this.#controller === id) { this.#controller = undefined; ++this.#lease; this.#state(); }
  }

  receive(id: string, message: unknown): void {
    const client = this.#clients.get(id);
    if (!client || !message || typeof message !== "object") return;
    const m = message as Record<string, unknown>;
    if (m.type === "ack" && Number.isSafeInteger(m.sequence)) {
      for (const [seq, bytes] of client.outstanding) if (seq <= (m.sequence as number)) { client.bytes -= bytes; client.outstanding.delete(seq); }
      return;
    }
    if (m.type === "take-control" && this.#exited === undefined) { this.#controller = id; ++this.#lease; this.#state(); return; }
    if (id !== this.#controller || m.lease !== this.#lease || m.epoch !== this.epoch || this.#exited !== undefined) return;
    if (m.type === "input" && typeof m.data === "string" && m.data.length <= 65536) this.pty.write(m.data);
    // xterm's binary event carries raw bytes (for example legacy mouse reports),
    // not Unicode text. Writing it as a string would UTF-8 encode high bytes.
    if (m.type === "input-binary" && typeof m.data === "string" && m.data.length <= 65536
      && /^[\x00-\xff]*$/u.test(m.data)) this.pty.write(Buffer.from(m.data, "latin1"));
    if (m.type === "resize" && Number.isInteger(m.cols) && Number.isInteger(m.rows)
      && (m.cols as number) >= 2 && (m.cols as number) <= 500 && (m.rows as number) >= 2 && (m.rows as number) <= 300) {
      this.terminal.resize(m.cols as number, m.rows as number);
      this.pty.resize(m.cols as number, m.rows as number);
      this.#broadcast({ type: "resize", cols: m.cols, rows: m.rows });
    }
  }

  dispose(): void {
    for (const client of this.#clients.values()) client.viewer.close();
    this.#clients.clear();
    if (this.#exited === undefined) this.pty.kill();
    this.terminal.dispose();
  }
  #state(): void { for (const [id, client] of this.#clients) client.viewer.send({ type: "control", active: this.#exited === undefined && id === this.#controller, exited: this.#exited, lease: this.#lease, epoch: this.epoch }); }
  #broadcast(message: object): void { for (const client of this.#clients.values()) client.viewer.send(message); }
}
