#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Authorization, startConnector } from "@agentonweb/connector-host";
import { TerminalSession } from "@agentonweb/terminal-core";
import { processDirectory } from "./process-directory.js";
import { lockHost } from "./host-lock.js";
import { executablePath, shellLaunch } from "./launch.js";
import { serviceCommand, serviceDirectory } from "./service.js";
import type { NativeSurface } from "@agentonweb/connector-contract";

const inputArgs = process.argv.slice(2);
if (inputArgs[0] === "service") {
  await serviceCommand(inputArgs.slice(1));
  process.exit(0);
}
if (inputArgs.length === 1 && inputArgs[0] === "--help") {
  console.log(
    "Usage: aow terminal | aow service install | aow service open | aow service status | aow service uninstall",
  );
  process.exit(0);
}
if (inputArgs.length && (inputArgs[0] !== "terminal" || inputArgs.slice(1).some((arg) => arg !== "--service"))) {
  throw new Error("Usage: aow terminal | aow service install | aow --help");
}
const { command, args } = shellLaunch();
const executable = await executablePath(command);
const cwd = homedir();
const runtimeId = "terminal";
const stateDirectory = serviceDirectory;
const unlock = await lockHost(stateDirectory);
const authority = await Authorization.open(stateDirectory);
const env = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);
type HostedSession = { session: TerminalSession; name?: string; directory: string; directoryRefresh?: Promise<void> };
const sessions = new Map<string, HostedSession>();
function sessionNames() {
  return [...sessions].map(([id, value]) => ({ id, name: value.name ?? (basename(value.directory) || value.directory) }));
}
function broadcastSessionNames() {
  const message = JSON.stringify({ type: "session-names", sessions: sessionNames() });
  for (const ws of sockets.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}
async function refreshDirectory(id: string, item: HostedSession): Promise<void> {
  if (item.name || sessions.get(id) !== item) return;
  if (item.directoryRefresh) return item.directoryRefresh;
  item.directoryRefresh = (async () => {
    const directory = await processDirectory(item.session.pty.pid);
    // A rename or close may have happened while the process lookup was pending.
    if (!directory || item.name || sessions.get(id) !== item || directory === item.directory) return;
    item.directory = directory;
    broadcastSessionNames();
  })();
  try { await item.directoryRefresh; }
  finally { delete item.directoryRefresh; }
}
class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function newSession() {
  if (sessions.size >= 8) throw new RequestError(409, "Close an unused terminal before opening another (maximum 8).");
  const id = randomUUID();
  const item: HostedSession = { session: new TerminalSession(executable, args, cwd, env), directory: cwd };
  sessions.set(id, item);
  // Coalesce shell output into at most one lookup per second per session,
  // regardless of viewer count. Idle shells create no directory traffic.
  let directoryTimer: ReturnType<typeof setTimeout> | undefined;
  const output = item.session.pty.onData(() => {
    if (item.name || directoryTimer || sockets.clients.size === 0) return;
    directoryTimer = setTimeout(() => {
      directoryTimer = undefined;
      void refreshDirectory(id, item);
    }, 1000);
  });
  item.session.pty.onExit(() => { clearTimeout(directoryTimer); output.dispose(); });
  return id;
}
newSession();
const adminSecret = randomBytes(32).toString("base64url");
const adminCookie = `aow_admin_${runtimeId.replaceAll("-", "_")}`;
function matchesCookie(cookie: string, name: string, secret: string): boolean {
  const expected = Buffer.from(secret);
  return cookie.split(";").some((part) => {
    const value = part.trim();
    if (!value.startsWith(`${name}=`)) return false;
    const actual = Buffer.from(value.slice(name.length + 1));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
const isAdmin = (cookie = "") => matchesCookie(cookie, adminCookie, adminSecret);
let secret = randomBytes(32).toString("base64url");
let launchToken: string = randomBytes(32).toString("base64url");
const cookieName = `aow_${runtimeId.replaceAll("-", "_")}`;
let origin = "";
const authenticated = (cookie = "") => isAdmin(cookie) || matchesCookie(cookie, cookieName, secret);
const tickets = new Map<string, { expires: number; sessionId: string }>();
async function saveEndpoint() {
  const temp = join(stateDirectory, "endpoint.tmp");
  await writeFile(
    temp,
    JSON.stringify({
      pid: process.pid,
      launchUrl: `${origin}/launch?token=${launchToken}`,
    }),
    { mode: 0o600 },
  );
  await rename(temp, join(stateDirectory, "endpoint.json"));
}
const publicRoot = new URL("./public/", import.meta.url);
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== new URL(origin).host) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url ?? "/", origin);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors http: https: chrome-extension: moz-extension: safari-web-extension:",
    );
    if (url.pathname === "/api/terminals" || url.pathname === "/api/connections") {
      const admin = isAdmin(req.headers.cookie);
      const permitted = url.pathname === "/api/connections" ? admin : authenticated(req.headers.cookie);
      if (
        !permitted ||
        req.headers["x-agentonweb-terminal"] !== "1" ||
        (req.headers.origin && req.headers.origin !== origin)
      ) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && url.pathname === "/api/terminals" && url.searchParams.has("cwd")) {
        const id = url.searchParams.get("cwd")!;
        const item = sessions.get(id);
        if (!item) { res.writeHead(404).end(); return; }
        res.end(JSON.stringify({ id, cwd: await processDirectory(item.session.pty.pid) }));
        return;
      }
      if (req.method === "POST") {
        if (req.headers.origin !== origin) {
          res.writeHead(403).end();
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) {
            res.writeHead(413).end();
            return;
          }
        }
        const action = JSON.parse(body);
        if (url.pathname === "/api/connections") {
          if (action.action === "revoke") await authority.revoke(action.id);
          else if (action.action === "allow" || action.action === "deny")
            await authority.decide(action.id, action.action === "allow");
          else {
            res.writeHead(400).end();
            return;
          }
        } else if (action.action === "new") {
          const id = newSession();
          res.end(JSON.stringify({ id }));
          return;
        } else if (action.action === "rename") {
          const item = sessions.get(action.id);
          if (!item) throw new RequestError(404, "Terminal no longer exists.");
          if (typeof action.name !== "string" || !action.name.trim() || action.name.trim().length > 80 || /[\x00-\x1f\x7f]/u.test(action.name))
            throw new RequestError(400, "Use a name of 1–80 characters without line breaks.");
          item.name = action.name.trim();
          broadcastSessionNames();
        } else if (action.action === "close" && sessions.has(action.id)) {
          sessions.get(action.id)!.session.dispose();
          sessions.delete(action.id);
        } else {
          res.writeHead(400).end();
          return;
        }
      } else if (req.method !== "GET") {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === "/api/connections") res.end(JSON.stringify(authority.snapshot()));
      else {
        await Promise.all([...sessions].map(([id, item]) => refreshDirectory(id, item)));
        res.end(JSON.stringify(sessionNames()));
      }
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === "/launch" && launchToken && url.searchParams.get("token") === launchToken) {
      launchToken = randomBytes(32).toString("base64url");
      await saveEndpoint();
      res.setHeader("Set-Cookie", [
        `${cookieName}=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
        `${adminCookie}=${adminSecret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
      ]);
      // Commit a first-party document before loading authenticated assets. An
      // immediate redirect retains a cross-site initiator and withholds Strict
      // cookies when the setup link came from another website or a local file.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(await readFile(new URL("index.html", publicRoot)));
      return;
    }
    if (url.pathname === "/" && !authenticated(req.headers.cookie)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<!doctype html><title>AgentOnWeb · Local terminal</title><h1>Connect your local terminal</h1><p>For first-time setup, run <code>aow service install</code> once on your Mac. Approve the extension in the setup browser tab. If already installed, <code>aow service open</code> opens that tab again.</p><p>For a foreground host, use the private setup link printed by <code>aow terminal</code>.</p>",
      );
      return;
    }
    if (!authenticated(req.headers.cookie)) {
      res.writeHead(401).end("Connect through AgentOnWeb, or open the one-time link printed in your host terminal.");
      return;
    }
    if (url.pathname === "/ticket") {
      if (req.headers["x-agentonweb-terminal"] !== "1" || (req.headers.origin && req.headers.origin !== origin)) {
        res.writeHead(403).end();
        return;
      }
      const sessionId = url.searchParams.get("session") ?? sessions.keys().next().value;
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(404).end();
        return;
      }
      const token = randomBytes(32).toString("base64url");
      for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key);
      if (tickets.size >= 64) {
        res.writeHead(429).end();
        return;
      }
      tickets.set(token, { expires: Date.now() + 10000, sessionId });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ token, executable, cwd, sessionId }));
      return;
    }
    const file =
      url.pathname === "/"
        ? "index.html"
        : url.pathname === "/main.js"
          ? "main.js"
          : url.pathname === "/main.css"
            ? "main.css"
            : undefined;
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith("html") ? "text/html; charset=utf-8" : file.endsWith("css") ? "text/css" : "text/javascript",
    );
    res.end(await readFile(new URL(file, publicRoot)));
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    const message = error instanceof RequestError ? error.message : "Terminal host request failed.";
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: message }));
  }
});
const sockets = new WebSocketServer({
  noServer: true,
  maxPayload: 100000,
  perMessageDeflate: false,
});
server.on("upgrade", (req, socket, head) => {
  if (
    req.headers.host !== new URL(origin).host ||
    req.headers.origin !== origin ||
    !authenticated(req.headers.cookie) ||
    req.url !== "/terminal"
  ) {
    socket.destroy();
    return;
  }
  const ticket = req.headers["sec-websocket-protocol"];
  const permission = typeof ticket === "string" ? tickets.get(ticket) : undefined;
  if (!permission || permission.expires < Date.now() || !sessions.has(permission.sessionId)) {
    socket.destroy();
    return;
  }
  const session = sessions.get(permission.sessionId)!.session;
  tickets.delete(ticket as string);
  sockets.handleUpgrade(req, socket, head, (ws) => {
    // Close the HTTP-list/WS-subscription gap, including background tab names.
    ws.send(JSON.stringify({ type: "session-names", sessions: sessionNames() }));
    void Promise.all([...sessions].map(([sessionId, item]) => refreshDirectory(sessionId, item)));
    const id = session.attach({
      send: (message) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
      },
      close: () => ws.close(4008, "Reconnect to restore terminal"),
    });
    ws.on("message", (raw) => {
      try {
        session.receive(id, JSON.parse(raw.toString()));
      } catch {
        ws.close(4400);
      }
    });
    ws.on("close", () => session.detach(id));
    ws.on("error", () => {});
  });
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start local host");
origin = `http://localhost:${address.port}`;
const surface: NativeSurface = {
  runtimeId,
  displayName: "Local terminal",
  url: `${origin}/`,
  cookie: { name: cookieName, value: secret, maxAgeSeconds: 86400 },
};
const connector = await startConnector(
  {
    runtime: {
      id: runtimeId,
      displayName: surface.displayName,
      surfaceKind: "web",
      capabilities: { translucency: true, optionTap: true },
    },
    approvalUrl: `${origin}/`,
    async getSurface() {
      return { ...surface, cookie: { ...surface.cookie, value: secret } };
    },
  },
  authority,
);
authority.onRevoke(() => {
  secret = randomBytes(32).toString("base64url");
  tickets.clear();
  for (const socket of sockets.clients) socket.close(4401, "Authorization revoked");
  connector.refreshSurfaces();
});
console.log(
  `AgentOnWeb · Local shell\nExecutable: ${executable}\nInitial directory: ${cwd}\nConnector: ${connector.port}\nOpen once: ${origin}/launch?token=${launchToken}\nApprove your browser through the private setup page.`,
);
await saveEndpoint();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const { session } of sessions.values()) session.dispose();
  await unlink(join(stateDirectory, "endpoint.json")).catch(() => {});
  for (const ws of sockets.clients) ws.terminate();
  await connector.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Active HTTP requests must not leave shutdown waiting indefinitely.
    server.closeAllConnections();
  });
  await unlock();
}
process.on("SIGINT", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});
