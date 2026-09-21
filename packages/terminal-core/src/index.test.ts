import { afterEach, expect, it, vi } from "vitest";
import { TerminalSession, type Viewer } from "./index.js";
const sessions: TerminalSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); });
function makeSession() {
  const session = new TerminalSession(process.execPath, ["-e", "process.stdin.setRawMode(true); process.stdout.write('READY\\r\\n'); process.stdin.on('data', b => process.stdout.write('INPUT:' + b.toString() + '\\r\\n'))"], process.cwd(), { PATH: process.env.PATH ?? "" });
  sessions.push(session); return session;
}
function viewer(session: TerminalSession) {
  const messages: any[] = [];
  const view: Viewer = { send: message => messages.push(message), close: vi.fn() };
  return { id: session.attach(view), messages, view };
}
it("restores parsed terminal state after a disconnected view while keeping the process", async () => {
  const session = makeSession(); const first = viewer(session);
  await vi.waitFor(() => expect(session.serializer.serialize()).toContain("READY"));
  session.receive(first.id, { type: "take-control" });
  const grant = first.messages.slice().reverse().find(m => m.type === "control");
  session.receive(first.id, { type: "input", data: "draft", epoch: grant.epoch, lease: grant.lease });
  await vi.waitFor(() => expect(session.serializer.serialize()).toContain("INPUT:draft"));
  const pid = session.pty.pid; session.detach(first.id);
  const second = viewer(session);
  await vi.waitFor(() => expect(second.messages.find(m => m.type === "snapshot")?.data).toContain("INPUT:draft"));
  expect(session.pty.pid).toBe(pid);
});
it("rejects old writer leases and only accepts resize from the controller", async () => {
  const session = makeSession(); const one = viewer(session); const two = viewer(session);
  session.receive(one.id, { type: "take-control" });
  const old = one.messages.slice().reverse().find(m => m.type === "control");
  session.receive(two.id, { type: "take-control" });
  const current = two.messages.slice().reverse().find(m => m.type === "control");
  session.receive(one.id, { type: "input", data: "FORBIDDEN", epoch: old.epoch, lease: old.lease });
  session.receive(one.id, { type: "resize", cols: 44, rows: 10, epoch: old.epoch, lease: old.lease });
  expect(session.terminal.cols).toBe(100);
  session.receive(two.id, { type: "resize", cols: 80, rows: 24, epoch: current.epoch, lease: current.lease });
  expect(session.terminal.cols).toBe(80);
  session.receive(two.id, { type: "input", data: "ALLOWED", epoch: current.epoch, lease: current.lease });
  await vi.waitFor(() => expect(session.serializer.serialize()).toContain("ALLOWED"));
  expect(session.serializer.serialize()).not.toContain("FORBIDDEN");
});
it("preserves raw mouse bytes while encoding ordinary terminal input as UTF-8", async () => {
  const session = new TerminalSession(process.execPath, ["-e", "process.stdin.setRawMode(true); process.stdout.write('READY\\r\\n'); process.stdin.on('data', b => process.stdout.write('HEX:' + b.toString('hex') + '\\r\\n'))"], process.cwd(), { PATH: process.env.PATH ?? "" });
  sessions.push(session);
  const client = viewer(session);
  await vi.waitFor(() => expect(session.serializer.serialize()).toContain("READY"));
  const grant = client.messages.slice().reverse().find(m => m.type === "control");
  session.receive(client.id, { type: "input-binary", data: "\x1b[M\x20\x80\x40", epoch: grant.epoch, lease: grant.lease });
  await vi.waitFor(() => expect(session.serializer.serialize()).toContain("HEX:1b5b4d208040"));
  session.receive(client.id, { type: "input", data: "世界 👋", epoch: grant.epoch, lease: grant.lease });
  await vi.waitFor(() => expect(session.serializer.serialize()).toContain(`HEX:${Buffer.from("世界 👋").toString("hex")}`));
  expect(session.serializer.serialize()).not.toContain("1b5b4d20c28040");
});
it("drops a slow viewer without stopping the PTY or a responsive viewer", async () => {
  const session = new TerminalSession(process.execPath, ["-e", "process.stdin.setRawMode(true); process.stdout.write('READY\\r\\n'); process.stdin.once('data', () => process.stdout.write(('line of output '.repeat(10)+'\\r\\n').repeat(5000)+'FLOOD_DONE'))"], process.cwd(), { PATH: process.env.PATH ?? "" });
  sessions.push(session);
  const slow = viewer(session);
  let fastId = "";
  const fastMessages: any[] = [];
  const fastClose = vi.fn();
  fastId = session.attach({ send(message: any) { fastMessages.push(message); if (message.type === "output") session.receive(fastId, { type: "ack", sequence: message.sequence }); }, close: fastClose });
  await vi.waitFor(() => expect(session.serializer.serialize()).toContain("READY"));
  session.receive(fastId, { type: "take-control" });
  const grant = fastMessages.slice().reverse().find(m => m.type === "control");
  session.receive(fastId, { type: "input", data: "x", epoch: grant.epoch, lease: grant.lease });
  // Observe delivered output instead of repeatedly serializing thousands of
  // scrollback lines while the parser is under load.
  await vi.waitFor(() => expect(fastMessages.filter(m => m.type === "output").map(m => m.data).join("")).toContain("FLOOD_DONE"), { timeout: 10000 });
  expect(slow.view.close).toHaveBeenCalledOnce();
  expect(fastClose).not.toHaveBeenCalled();
}, 15000);

it.skipIf(process.platform === "win32")("closing a terminal stops its shell and foreground child", async () => {
  const session = new TerminalSession("/bin/sh", ["-c", '"$1" -e \'process.stdout.write("CHILD_PID:" + process.pid + "\\n"); setInterval(() => {}, 1000)\'; :', "aow-test", process.execPath], process.cwd(), { PATH: process.env.PATH ?? "" });
  sessions.push(session);
  let childPid: number | undefined;
  const running = (pid: number) => {
    try { process.kill(pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
  };
  try {
    await vi.waitFor(() => {
      const match = /CHILD_PID:(\d+)/u.exec(session.serializer.serialize());
      expect(match).not.toBeNull(); childPid = Number(match![1]);
    });
    expect(childPid).not.toBe(session.pty.pid);
    expect(running(childPid!)).toBe(true);
    session.dispose();
    await vi.waitFor(() => {
      expect(running(session.pty.pid)).toBe(false);
      expect(running(childPid!)).toBe(false);
    });
  } finally {
    // Only the child created by this test is eligible for failure cleanup.
    if (childPid && running(childPid)) process.kill(childPid, "SIGKILL");
  }
});

it("does not grant control or accept input after the process exits", async () => {
  const session = new TerminalSession(process.execPath, ["-e", "process.exit(7)"], process.cwd(), { PATH: process.env.PATH ?? "" });
  sessions.push(session);
  const first = viewer(session);
  await vi.waitFor(() => expect(first.messages.some(m => m.type === "exit" && m.code === 7)).toBe(true));
  const restored = viewer(session);
  await vi.waitFor(() => expect(restored.messages.find(m => m.type === "snapshot")?.exitCode).toBe(7));
  const grant = restored.messages.slice().reverse().find(m => m.type === "control");
  expect(grant.active).toBe(false);
  const write = vi.spyOn(session.pty, "write");
  const resize = vi.spyOn(session.pty, "resize");
  const count = restored.messages.length;
  session.receive(restored.id, { type: "take-control" });
  session.receive(restored.id, { type: "input", epoch: grant.epoch, lease: grant.lease, data: "ignored" });
  session.receive(restored.id, { type: "resize", epoch: grant.epoch, lease: grant.lease, cols: 80, rows: 24 });
  expect(restored.messages).toHaveLength(count);
  expect(write).not.toHaveBeenCalled();
  expect(resize).not.toHaveBeenCalled();
});
