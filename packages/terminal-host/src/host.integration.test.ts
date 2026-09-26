import { createConnection } from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, stat, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { once } from "node:events";
import { afterEach, expect, it } from "vitest";
import WebSocket from "ws";
let host: ChildProcess | undefined;
let directory = "";
afterEach(async () => {
  if (host && host.exitCode === null) {
    const stopped = once(host, "exit");
    host.kill("SIGTERM");
    await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
  host = undefined;
});
it("keeps shell sessions alive across viewers and isolates setup authorization from delegated terminals", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-shell-test-"));
  host = spawn(process.execPath, [resolve("packages/terminal-host/lib/cli.js"), "terminal"], {
    env: {
      ...process.env,
      HOME: directory,
      SHELL: "/bin/sh",
      ENV: undefined,
      BASH_ENV: undefined,
      ZDOTDIR: undefined,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  host.stdout!.on("data", (chunk) => {
    output += String(chunk);
  });
  let errors = "";
  host.stderr!.on("data", (chunk) => {
    errors += String(chunk);
  });
  await expect.poll(() => output.includes("Open once:"), { timeout: 10000 }).toBe(true);
  expect(errors).toBe("");
  const launchUrl = /Open once: (http:\/\/[^\s]+)/u.exec(output)![1]!;
  const origin = new URL(launchUrl).origin;
  const token = new URL(launchUrl).searchParams.get("token")!;
  for (const invalid of ["", token + "x", token.slice(0, -1), token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")]) {
    expect((await fetch(`${origin}/launch?token=${invalid}`)).status).toBe(401);
  }
  expect((await fetch(origin + "/launch")).status).toBe(401);
  const launch = await fetch(launchUrl, { redirect: "manual" });
  expect(launch.status).toBe(200);
  expect(launch.headers.get("location")).toBeNull();
  expect(await launch.text()).toContain("Terminal sessions");
  const cookies = launch.headers.getSetCookie().map((value) => value.split(";")[0]!);
  const delegated = cookies.find((cookie) => !cookie.startsWith("aow_admin_"))!;
  const headers = { Cookie: delegated, "X-AgentOnWeb-Terminal": "1" };
  for (const cookie of [
    delegated + "x",
    delegated.slice(0, -1),
    delegated.slice(0, -1) + (delegated.endsWith("A") ? "B" : "A"),
    "prefix_" + delegated,
  ]) {
    expect(
      (
        await fetch(origin + "/api/terminals", {
          headers: { ...headers, Cookie: cookie },
        })
      ).status,
    ).toBe(403);
  }
  expect((await fetch(origin + "/api/connections", { headers })).status).toBe(403);
  expect(
    (
      await fetch(origin + "/api/connections", {
        headers: { ...headers, Cookie: cookies.join("; ") },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(origin + "/api/terminals", {
        headers: { ...headers, Origin: "https://example.org" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(origin + "/api/terminals", {
        method: "POST",
        headers,
        body: '{"action":"new"}',
      })
    ).status,
  ).toBe(403);
  expect((await fetch(launchUrl, { redirect: "manual" })).status).toBe(401);
  for (const endpoint of ["/api/terminals", "/api/connections"]) {
    for (const body of ["{", "", "null", "[]", "42", '"new"']) {
      const response = await fetch(origin + endpoint, {
        method: "POST",
        headers: { ...headers, Cookie: cookies.join("; "), Origin: origin },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
    }
  }
  const initial = (await (await fetch(origin + "/api/terminals", { headers })).json()) as { id: string }[];
  const created = (await (
    await fetch(origin + "/api/terminals", {
      method: "POST",
      headers: { ...headers, Origin: origin },
      body: '{"action":"new"}',
    })
  ).json()) as { id: string };
  expect(created.id).not.toBe(initial[0]!.id);


  for (let count = 2; count < 8; count++) {
    expect(
      (
        await fetch(origin + "/api/terminals", {
          method: "POST",
          headers: { ...headers, Origin: origin },
          body: '{"action":"new"}',
        })
      ).status,
    ).toBe(200);
  }
  const full = await fetch(origin + "/api/terminals", {
    method: "POST",
    headers: { ...headers, Origin: origin },
    body: '{"action":"new"}',
  });
  expect(full.status).toBe(409);
  expect(await full.json()).toEqual({
    error: "Close an unused terminal before opening another (maximum 8).",
  });
  const ticket = (await (await fetch(origin + "/ticket?session=" + created.id, { headers })).json()) as {
    token: string;
  };
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/terminal", ticket.token, {
    headers: { Cookie: delegated, Origin: origin },
  });
  const names: any[] = [];
  let control: any;
  let text = "";
  let sent = false;
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === "session-names") names.push(message.sessions);
    if (message.type === "control") control = message;
    if (message.type === "output" || message.type === "snapshot") text += message.data;
    if (message.type === "control" && message.active && !sent) {
      sent = true;
      socket.send(
        JSON.stringify({
          type: "input",
          epoch: message.epoch,
          lease: message.lease,
          data: "cd /tmp\npwd\nprintf 'AOW_%s_OK\\n' SHELL_TEST\n",
        }),
      );
    }
  });
  await expect
    .poll(() => text.includes("AOW_SHELL_TEST_OK") && text.includes("/tmp"), {
      timeout: 5000,
    })
    .toBe(true);
  const folderUrl = origin + "/api/terminals?cwd=" + created.id;
  expect((await fetch(folderUrl)).status).toBe(403);
  if (["darwin", "linux"].includes(process.platform)) {
    expect(await (await fetch(folderUrl, { headers })).json()).toEqual({ id: created.id, cwd: await realpath("/tmp") });
    await expect.poll(() => names.at(-1)?.find((item: any) => item.id === created.id)?.name, { timeout: 3000 }).toBe(basename(await realpath("/tmp")));
    const labels = await (await fetch(origin + "/api/terminals", { headers })).json();
    expect(labels.find((item: any) => item.id === created.id).name).toBe(basename(await realpath("/tmp")));
    const other = await (await fetch(origin + "/api/terminals?cwd=" + initial[0]!.id, { headers })).json();
    expect(other.id).toBe(initial[0]!.id);
    expect(other.cwd).not.toBe(await realpath("/tmp"));
  }
  expect((await fetch(origin + "/api/terminals?cwd=missing", { headers })).status).toBe(404);
  const backgroundTicket = await (await fetch(origin + "/ticket?session=" + initial[0]!.id, { headers })).json() as { token: string };
  const background = new WebSocket(origin.replace("http:", "ws:") + "/terminal", backgroundTicket.token, {
    headers: { Cookie: delegated, Origin: origin },
  });
  const backgroundNames: any[] = [];
  background.on("message", raw => {
    const message = JSON.parse(String(raw));
    if (message.type === "session-names") backgroundNames.push(message.sessions);
  });
  await expect.poll(() => backgroundNames.length).toBeGreaterThan(0);
  if (["darwin", "linux"].includes(process.platform)) {
    // No GET refresh here: output from a later cd must update both viewers.
    socket.send(JSON.stringify({ type: "input", epoch: control.epoch, lease: control.lease, data: "cd /\npwd\n" }));
    await expect.poll(() => backgroundNames.at(-1)?.find((item: any) => item.id === created.id)?.name, { timeout: 3000 }).toBe("/");
    await expect.poll(() => names.at(-1)?.find((item: any) => item.id === created.id)?.name).toBe("/");
  }
  const rename = (name: unknown) => fetch(origin + "/api/terminals", { method: "POST", headers: { ...headers, Origin: origin }, body: JSON.stringify({ action: "rename", id: created.id, name }) });
  expect((await rename("  API server  ")).status).toBe(200);
  await expect.poll(() => names.at(-1)?.find((item: any) => item.id === created.id)?.name).toBe("API server");
  await expect.poll(() => backgroundNames.at(-1)?.find((item: any) => item.id === created.id)?.name).toBe("API server");
  background.close();
  const renamed = await (await fetch(origin + "/api/terminals", { headers })).json();
  expect(renamed.find((item: any) => item.id === created.id).name).toBe("API server");
  for (const name of [" ", "x".repeat(81), "line\nbreak", 42]) expect((await rename(name)).status).toBe(400);
  socket.close();
  const kept = (await (await fetch(origin + "/api/terminals", { headers })).json()) as { id: string }[];
  expect(kept.some((item) => item.id === created.id)).toBe(true);
  await fetch(origin + "/api/terminals", {
    method: "POST",
    headers: { ...headers, Origin: origin },
    body: JSON.stringify({ action: "close", id: created.id }),
  });
  expect((await fetch(origin + "/ticket?session=" + created.id, { headers })).status).toBe(404);
  expect(
    (
      await fetch(origin + "/api/terminals", {
        method: "POST",
        headers: { ...headers, Origin: origin },
        body: '{"action":"new"}',
      })
    ).status,
  ).toBe(200);
  // An unfinished HTTP request must not retain the listener or lock on shutdown.
  const unfinished = createConnection({
    host: "127.0.0.1",
    port: Number(new URL(origin).port),
  });
  await once(unfinished, "connect");
  unfinished.write(`GET / HTTP/1.1\r\nHost: ${new URL(origin).host}\r\n`);
  const stopped = once(host, "exit");
  host.kill("SIGTERM");
  try {
    await expect.poll(() => host!.exitCode, { timeout: 2000 }).toBe(0);
    await stopped;
    for (const file of ["endpoint.json", "host.pid", "host.pid.guard"]) {
      await expect(stat(join(directory, ".agentonweb", "terminal", file))).rejects.toMatchObject({ code: "ENOENT" });
    }
  } finally {
    unfinished.destroy();
  }
}, 15000);

it("rejects unknown commands before creating a host", () => {
  const result = spawnSync(process.execPath, [resolve("packages/terminal-host/lib/cli.js"), "unknown-command"], {
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Usage: aow setup");
});

it("reports a lock release failure and exits after closing the host", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-shutdown-test-"));
  host = spawn(process.execPath, [resolve("packages/terminal-host/lib/cli.js"), "terminal"], {
    env: { ...process.env, HOME: directory, SHELL: "/bin/sh", ENV: undefined, BASH_ENV: undefined, ZDOTDIR: undefined },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  host.stdout!.on("data", chunk => { output += String(chunk); });
  host.stderr!.on("data", chunk => { errors += String(chunk); });
  const stateDirectory = join(directory, ".agentonweb", "terminal");
  await expect.poll(() => stat(join(stateDirectory, "endpoint.json")).then(() => true, () => false), { timeout: 10000 }).toBe(true);
  await mkdir(join(stateDirectory, "host.pid.guard"));
  const stopped = once(host, "exit");
  host.kill("SIGTERM");
  await expect.poll(() => host!.exitCode, { timeout: 3000 }).toBe(1);
  await stopped;
  expect(errors).toContain("Terminal host shutdown failed.");
  expect(errors).toContain("lock update is in progress");
  await expect(stat(join(stateDirectory, "endpoint.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const origin = new URL(/Open once: (http:\/\/[^\s]+)/u.exec(output)![1]!).origin;
  await expect(fetch(origin)).rejects.toThrow();
}, 15000);

it("refreshes other authorized browsers after revocation without stopping their shell", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-revoke-test-"));
  host = spawn(process.execPath, [resolve("packages/terminal-host/lib/cli.js"), "terminal"], {
    env: {
      ...process.env,
      HOME: directory,
      SHELL: "/bin/sh",
      ENV: undefined,
      BASH_ENV: undefined,
      ZDOTDIR: undefined,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  host.stdout!.on("data", (chunk) => {
    output += String(chunk);
  });
  await expect.poll(() => output.includes("Open once:"), { timeout: 10000 }).toBe(true);
  const launchUrl = /Open once: (http:\/\/[^\s]+)/u.exec(output)![1]!;
  const origin = new URL(launchUrl).origin;
  const connectorUrl = `ws://127.0.0.1:${/Connector: (\d+)/u.exec(output)![1]}`;
  const launch = await fetch(launchUrl, { redirect: "manual" });
  const adminCookie = launch.headers
    .getSetCookie()
    .map((value) => value.split(";")[0]!)
    .join("; ");
  const headers = {
    Cookie: adminCookie,
    "X-AgentOnWeb-Terminal": "1",
    Origin: origin,
  };
  const connections = async () => (await fetch(origin + "/api/connections", { headers })).json();
  const mutate = async (action: string, id: string) =>
    fetch(origin + "/api/connections", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, id }),
    });
  const frame = (socket: WebSocket): Promise<any> => new Promise(resolve => {
    const receive = (raw: WebSocket.RawData) => {
      const message = JSON.parse(String(raw));
      if (message.kind === "agent.sessions") return;
      socket.off("message", receive);
      resolve(message);
    };
    socket.on("message", receive);
  });
  const connect = async (extensionOrigin: string, credential?: string) => {
    const socket = new WebSocket(connectorUrl, {
      headers: { Origin: extensionOrigin },
    });
    await once(socket, "open");
    const received = frame(socket);
    socket.send(
      JSON.stringify({
        kind: "hello",
        protocolVersion: 1,
        ...(credential ? { credential } : { intent: "pair" }),
      }),
    );
    const message = await received;
    if (credential) return { socket, credential, message };
    expect(message.kind).toBe("pending");
    const pending = (await connections()).pending.find((item: { origin: string }) => item.origin === extensionOrigin);
    const accepted = frame(socket);
    await mutate("allow", pending.id);
    return { socket, credential: (await accepted).credential as string };
  };
  const first = await connect("chrome-extension://" + "a".repeat(32));
  const secondOrigin = "chrome-extension://" + "b".repeat(32);
  const second = await connect(secondOrigin);
  const surface = async (socket: WebSocket) => {
    const received = frame(socket);
    socket.send(
      JSON.stringify({
        kind: "request",
        id: "surface",
        command: { type: "surface.get" },
      }),
    );
    return (await received).result;
  };
  const before = await surface(second.socket);
  const terminalHeaders = {
    Cookie: `${before.cookie.name}=${before.cookie.value}`,
    "X-AgentOnWeb-Terminal": "1",
  };
  const terminals = await (await fetch(origin + "/api/terminals", { headers: terminalHeaders })).json();
  const firstClosed = once(first.socket, "close");
  const secondClosed = once(second.socket, "close");
  const firstGrant = (await connections()).grants.find((item: { origin: string }) => item.origin !== secondOrigin);
  await mutate("revoke", firstGrant.id);
  expect((await firstClosed)[0]).toBe(4401);
  expect((await secondClosed)[0]).toBe(1012);
  expect((await fetch(origin + "/api/terminals", { headers: terminalHeaders })).status).toBe(403);
  const restored = await connect(secondOrigin, second.credential);
  try {
    expect(restored.message.kind).toBe("hello");
    const after = await surface(restored.socket);
    expect(after.cookie.value).not.toBe(before.cookie.value);
    const result = await fetch(origin + "/api/terminals", {
      headers: {
        ...terminalHeaders,
        Cookie: `${after.cookie.name}=${after.cookie.value}`,
      },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(terminals);
    expect((await connections()).grants).toHaveLength(1);
  } finally {
    restored.socket.close();
  }
}, 15000);

it("delivers authenticated Codex hooks without a terminal viewer and restores the latest snapshot", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-agent-events-"));
  const cli = resolve("packages/terminal-host/lib/cli.js");
  host = spawn(process.execPath, [cli, "terminal"], {
    env: { ...process.env, HOME: directory, SHELL: "/bin/sh", ENV: undefined, BASH_ENV: undefined, ZDOTDIR: undefined },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  host.stdout!.on("data", chunk => { output += String(chunk); });
  await expect.poll(() => output.includes("Open once:"), { timeout: 10000 }).toBe(true);
  const launchUrl = /Open once: (http:\/\/[^\s]+)/u.exec(output)![1]!;
  const origin = new URL(launchUrl).origin;
  const launch = await fetch(launchUrl);
  const Cookie = launch.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const headers = { Cookie, "X-AgentOnWeb-Terminal": "1", Origin: origin };
  const connectorUrl = `ws://127.0.0.1:${/Connector: (\d+)/u.exec(output)![1]}`;
  const extensionOrigin = "chrome-extension://" + "c".repeat(32);
  const socket = new WebSocket(connectorUrl, { headers: { Origin: extensionOrigin } });
  const frames: any[] = [];
  socket.on("message", raw => frames.push(JSON.parse(String(raw))));
  await once(socket, "open");
  socket.send(JSON.stringify({ kind: "hello", protocolVersion: 1, intent: "pair", agentSessions: true }));
  await expect.poll(() => frames.some(frame => frame.kind === "pending")).toBe(true);
  expect(frames.some(frame => frame.kind === "agent.sessions")).toBe(false);
  const connections = await (await fetch(origin + "/api/connections", { headers })).json();
  await fetch(origin + "/api/connections", { method: "POST", headers, body: JSON.stringify({ action: "allow", id: connections.pending[0].id }) });
  await expect.poll(() => frames.some(frame => frame.kind === "agent.sessions")).toBe(true);
  const credential = frames.find(frame => frame.kind === "hello").credential;
  const hookUrl = origin.replace("localhost", "127.0.0.1") + "/agent-event";
  for (const h of [{}, { Cookie }, { authorization: "Bearer invalid" }, { Origin: origin }])
    expect((await fetch(hookUrl, { method: "POST", headers: h, body: "{}" })).status).toBe(403);
  const terminals = await (await fetch(origin + "/api/terminals", { headers })).json();
  const terminalId = terminals[0].id;
  const ticket = await (await fetch(origin + "/ticket?session=" + terminalId, { headers })).json();
  const terminal = new WebSocket(origin.replace("http:", "ws:") + "/terminal", ticket.token, { headers });
  let epoch = "";
  terminal.on("message", raw => { const m = JSON.parse(String(raw)); if (m.type === "snapshot") epoch = m.epoch; });
  await expect.poll(() => Boolean(epoch)).toBe(true);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const report = (event: string) => `printf %s ${quote(JSON.stringify({ hook_event_name: event, session_id: "actual-hook-session", turn_id: "turn-one", prompt: "Verify hook transport", tool_name: "Bash" }))} | ${quote(process.execPath)} ${quote(cli)} agent-event`;
  terminal.send(JSON.stringify({ type: "input", epoch, data: `${report("UserPromptSubmit")}\nsleep 0.2\n${report("PermissionRequest")}\nsleep 0.2\n${quote(process.execPath)} ${quote(cli)} agent-notify ${quote(JSON.stringify({ type: "agent-turn-complete", "thread-id": "actual-hook-session", "turn-id": "turn-one" }))}\n` }));
  // Semantic notifications must outlive the xterm viewing connection.
  terminal.close();
  await expect.poll(() => frames.filter(frame => frame.kind === "agent.sessions").some(frame => frame.sessions[0]?.status === "completed"), { timeout: 5000 }).toBe(true);
  const updates = frames.filter(frame => frame.kind === "agent.sessions").flatMap(frame => frame.sessions);
  expect(updates.map(item => item.status)).toEqual(expect.arrayContaining(["running", "approval", "completed"]));
  expect(updates.every(item => item.terminalId === terminalId)).toBe(true);
  socket.close();
  const restored = new WebSocket(connectorUrl, { headers: { Origin: extensionOrigin } });
  const snapshots: any[] = [];
  restored.on("message", raw => { const frame = JSON.parse(String(raw)); if (frame.kind === "agent.sessions") snapshots.push(frame.sessions); });
  await once(restored, "open");
  restored.send(JSON.stringify({ kind: "hello", protocolVersion: 1, credential, agentSessions: true }));
  await expect.poll(() => snapshots[0]?.[0]?.status).toBe("completed");
  await fetch(origin + "/api/terminals", { method: "POST", headers, body: JSON.stringify({ action: "close", id: terminalId }) });
  await expect.poll(() => snapshots.at(-1)).toEqual([]);
  restored.close();
}, 15000);


it("installs packaged Codex hooks and notify without changing permissions, models or existing integrations", async () => {
  directory = await mkdtemp(join(tmpdir(), "aow-codex-install-"));
  const before = '# Keep this comment\nmodel = "custom-model"\napproval_policy = "on-request"\nnotify = ["old-notifier", "fixed argument"]\n';
  await writeFile(join(directory, "config.toml"), before);
  await writeFile(join(directory, "hooks.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "my-stop-hook" }] }] } }));
  const install = () => spawnSync(process.execPath, [resolve("packages/terminal-host/lib/cli.js"), "codex-hooks", "install"], {
    env: { ...process.env, CODEX_HOME: directory }, encoding: "utf8",
  });
  const first = install();
  expect(first.status).toBe(0);
  expect(first.stdout).toContain("/hooks");
  const config = await readFile(join(directory, "config.toml"), "utf8");
  expect(config).toContain('# Keep this comment\nmodel = "custom-model"\napproval_policy = "on-request"\n');
  expect(config).toContain("agent-notify");
  const hooks = JSON.parse(await readFile(join(directory, "hooks.json"), "utf8"));
  expect(hooks.hooks.Stop[0].hooks[0].command).toBe("my-stop-hook");
  expect(hooks.hooks.PermissionRequest[0].hooks[0].command).toContain("agent-event");
  expect((await readdir(directory)).some(name => name.startsWith("config.toml.agentonweb-") && name.endsWith(".bak"))).toBe(true);
  expect(install().status).toBe(0);
  expect(await readFile(join(directory, "config.toml"), "utf8")).toBe(config);
  expect(JSON.parse(await readFile(join(directory, "hooks.json"), "utf8"))).toEqual(hooks);
  const removed = spawnSync(process.execPath, [resolve("packages/terminal-host/lib/cli.js"), "codex-hooks", "uninstall"], {
    env: { ...process.env, CODEX_HOME: directory }, encoding: "utf8",
  });
  expect(removed.status).toBe(0);
  expect(await readFile(join(directory, "config.toml"), "utf8")).toBe(before.replace('["old-notifier", "fixed argument"]', '["old-notifier","fixed argument"]'));
  expect(JSON.parse(await readFile(join(directory, "hooks.json"), "utf8"))).toEqual({ hooks: { Stop: [{ hooks: [{ type: "command", command: "my-stop-hook" }] }] } });
});

it('pairs through the native bridge once, rejects web callers and preserves revocation', async () => {
  const { installNativeBridge, nativeRequest, encodeNativeMessage } = await import('./native-bridge.js');
  directory = await mkdtemp(join(tmpdir(), 'aow-native-pair-'));
  const id = 'd'.repeat(32), extension = `chrome-extension://${id}`;
  const cli = resolve('packages/terminal-host/lib/cli.js');
  await installNativeBridge(cli, [id], directory);
  host = spawn(process.execPath, [cli, 'terminal'], { env: { ...process.env, HOME: directory, SHELL: '/bin/sh', ENV: undefined }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; host.stdout!.on('data', chunk => { output += chunk; });
  await expect.poll(() => output.includes('Open once:'), { timeout: 10000 }).toBe(true);
  const launchUrl = /Open once: (http:\/\/[^\s]+)/u.exec(output)![1]!;
  const origin = new URL(launchUrl).origin;
  const state = join(directory, '.agentonweb/terminal');
  const endpoint = JSON.parse(await readFile(join(state, 'endpoint.json'), 'utf8'));
  expect(await nativeRequest(state, extension, { type: 'probe' })).toEqual({ ok: true, canPair: true });
  const native = spawn(process.execPath, [cli, 'native-host', extension + '/'], { env: { ...process.env, HOME: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
  const nativeChunks: Buffer[] = []; native.stdout.on('data', chunk => nativeChunks.push(chunk));
  native.stdin.end(encodeNativeMessage({ type: 'probe' }));
  await once(native, 'exit');
  const nativeOutput = Buffer.concat(nativeChunks);
  expect(nativeOutput.readUInt32LE(0)).toBe(nativeOutput.length - 4);
  expect(JSON.parse(nativeOutput.subarray(4).toString())).toEqual({ ok: true, canPair: true });
  for (const headers of [{}, { Origin: 'https://example.com', authorization: `Bearer ${endpoint.nativeToken}` }])
    expect((await fetch(origin + '/native-pair', { method: 'POST', headers, body: '{}' })).status).toBe(403);
  await expect(nativeRequest(state, extension, { type: 'pair', expectedOrigin: 'http://localhost:1' })).rejects.toThrow('Different runtime');
  const port = /Connector: (\d+)/u.exec(output)![1];
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: extension } });
  const frames: any[] = []; socket.on('message', raw => frames.push(JSON.parse(raw.toString())));
  try {
    await once(socket, 'open'); socket.send(JSON.stringify({ kind: 'hello', protocolVersion: 1, intent: 'pair' }));
    await expect.poll(() => frames.some(f => f.kind === 'pending')).toBe(true);
    expect(await nativeRequest(state, extension, { type: 'pair', expectedOrigin: origin })).toEqual({ ok: true });
    await expect.poll(() => frames.some(f => f.kind === 'hello' && f.credential)).toBe(true);
    expect(await nativeRequest(state, extension, { type: 'probe' })).toEqual({ ok: true, canPair: false });
    const launch = await fetch(launchUrl);
    const Cookie = launch.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const headers = { Cookie, Origin: origin, 'X-AgentOnWeb-Terminal': '1' };
    const connections = await (await fetch(origin + '/api/connections', { headers })).json();
    expect((await fetch(origin + '/api/connections', { method: 'POST', headers, body: JSON.stringify({ action: 'revoke', id: connections.grants[0].id }) })).ok).toBe(true);
    expect(await nativeRequest(state, extension, { type: 'probe' })).toEqual({ ok: true, canPair: false });
  } finally { socket.close(); }
}, 20000);
