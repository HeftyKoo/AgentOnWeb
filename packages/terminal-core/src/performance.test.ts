import { afterEach, expect, it, vi } from "vitest";
import { TerminalSession } from "./index.js";

const pty = vi.hoisted(() => ({
  data: undefined as ((data: string) => void) | undefined,
  exit: undefined as ((event: { exitCode: number }) => void) | undefined,
  write: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), kill: vi.fn(),
}));
vi.mock("node-pty", () => ({ spawn: () => ({ ...pty,
  onData(callback: typeof pty.data) { pty.data = callback; },
  onExit(callback: typeof pty.exit) { pty.exit = callback; },
}) }));
let session: TerminalSession;
afterEach(() => { session?.dispose(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const parsed = () => new Promise<void>(done => session.terminal.write("", done));
async function fixture() {
  session = new TerminalSession("fixture", [], "/", {});
  const messages: any[] = [];
  const close = vi.fn();
  const id = session.attach({ send: message => messages.push(message), close });
  await parsed();
  return { id, messages, close };
}

it("keeps cumulative ACK work linear while a viewer drains a large output backlog", async () => {
  const { id, messages } = await fixture();
  for (let i = 0; i < 4000; i++) pty.data!("x");
  await parsed();
  // Count queue entries visited, not machine-dependent timing. This exercises
  // the real parser/broadcast/receive chain with many outstanding output frames.
  const frames = messages.filter(message => message.type === "output");
  let visited = 0;
  const original = Map.prototype[Symbol.iterator];
  const iterator = vi.spyOn(Map.prototype, Symbol.iterator).mockImplementation(function* (this: Map<unknown, unknown>) {
    for (const entry of original.call(this)) { visited++; yield entry; }
    return undefined;
  });
  for (const frame of frames) session.receive(id, { type: "ack", sequence: frame.sequence });
  iterator.mockRestore();
  expect(visited).toBeLessThanOrEqual(frames.length * 2);
  session.receive(id, { type: "input", epoch: session.epoch, data: "responsive" });
  expect(pty.write).toHaveBeenLastCalledWith("responsive");
});

it("only pauses and resumes the PTY when crossing parser watermarks", async () => {
  await fixture();
  pty.data!("small output");
  await parsed();
  expect(pty.resume).not.toHaveBeenCalled();
  for (let i = 0; i < 40; i++) pty.data!("x".repeat(8192));
  await parsed();
  expect(pty.pause).toHaveBeenCalledTimes(1);
  expect(pty.resume).toHaveBeenCalledTimes(1);
});

it("ignores unchanged viewport sizes without resizing the PTY or notifying viewers", async () => {
  const { id, messages } = await fixture();
  session.receive(id, { type: "focus", epoch: session.epoch });
  const control = messages.at(-1);
  const size = { type: "resize", epoch: session.epoch, lease: control.lease, cols: 100, rows: 30 };
  for (let i = 0; i < 20; i++) session.receive(id, size);
  expect(pty.resize).not.toHaveBeenCalled();
  expect(messages.filter(message => message.type === "resize")).toHaveLength(0);
  session.receive(id, { ...size, cols: 80 });
  expect(pty.resize).toHaveBeenCalledTimes(1);
});
