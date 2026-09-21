import { createConnection } from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  let text = "";
  let sent = false;
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
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
  expect(result.stderr).toContain("Usage: aow terminal");
});

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
  const frame = async (socket: WebSocket) => JSON.parse(String((await once(socket, "message"))[0]));
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
