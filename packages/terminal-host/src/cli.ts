#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Authorization, startConnector } from "@agentonweb/connector-host";
import { TerminalSession } from "@agentonweb/terminal-core";
import { processDirectory } from "./process-directory.js";
import { lockHost } from "./host-lock.js";
import { cleanup } from "./cleanup.js";
import { executablePath, shellLaunch } from "./launch.js";
import { serviceCommand, serviceDirectory } from "./service.js";
import { setup, uninstall } from "./setup.js";
import { runNativeHost, nativeOrigins } from "./native-bridge.js";
import { AgentSessions } from "./agent-sessions.js";
import { installCodexHooks, uninstallCodexHooks, reportCodexInput } from "./codex-hooks.js";
import { completionEvent, forwardNotification } from "./codex-notify.js";
import { installClaudeHooks, uninstallClaudeHooks } from "./claude-hooks.js";
import { installPiExtension, uninstallPiExtension } from "./pi-hooks.js";
import { reportAgentEvent } from "./agent-events.js";
import type { NativeSurface } from "@agentonweb/connector-contract";
import { VERSION, installedVersion } from './version.js';
import { Updates } from './updates.js';
import { Maintenance } from './management.js';
import { updateCommand } from './upgrade.js';
import { formatHelp, hasHelp } from './cli-help.js';
import { printError, printStatus, terminalUi } from './cli-ui.js';

const inputArgs = process.argv.slice(2);
try {
  if (inputArgs.length === 1 && ['--help', '-h', 'help'].includes(inputArgs[0]!)) {
    console.log(formatHelp()); process.exit(0);
  }
  if (inputArgs.length === 2 && (inputArgs[0] === 'help' && hasHelp(inputArgs[1]!) ||
      ['--help', '-h'].includes(inputArgs[1]!) && hasHelp(inputArgs[0]!))) {
    console.log(formatHelp(inputArgs[0] === 'help' ? inputArgs[1] : inputArgs[0])); process.exit(0);
  }
  if (inputArgs.length === 1 && inputArgs[0] === '--version') {
    console.log(VERSION); process.exit(0);
  }
  if (inputArgs[0] === 'update' || inputArgs[0] === 'check-update') {
    try {
      if (inputArgs[0] === 'update') await updateCommand(inputArgs.slice(1));
      else {
        const option = inputArgs[1];
        if (inputArgs.length > 2 || option && !['--enable', '--disable', '--help', '-h'].includes(option)) throw new Error('Usage: aow check-update [--enable|--disable]');
        const updates = new Updates(serviceDirectory);
        if (option === '--help' || option === '-h') console.log(formatHelp('check-update'));
        else if (option) {
          await updates.configure(option === '--enable');
          printStatus('ok', `Automatic update checks ${option === '--enable' ? 'enabled' : 'disabled'}.`);
        } else {
          const status = await updates.check(true);
          if (status.error) throw new Error(status.error);
          printStatus('info', `Installed CLI: ${VERSION}`);
          printStatus('info', `Latest stable: ${status.latest}`);
          printStatus(status.updateAvailable ? 'warn' : 'ok', status.updateAvailable ? 'Update available. Run aow update from a separate macOS Terminal.' : 'No newer stable version available.');
        }
      }
    } catch (error) {
      printError(error); process.exit(1);
    }
    process.exit(0);
  }
  if (inputArgs[0] === "native-host") {
    await runNativeHost(inputArgs[1] ?? "", serviceDirectory);
    process.exit(0);
  }
  if (inputArgs[0] === "setup") {
    await setup(inputArgs.slice(1));
    process.exit(0);
  }
  if (inputArgs[0] === "uninstall" && inputArgs.length === 1) {
    await uninstall();
    process.exit(0);
  }
  if (inputArgs[0] === "agent-notify") {
    const payload = inputArgs.at(-1) ?? "";
    try {
      const event = completionEvent(JSON.parse(payload));
      if (event) await reportCodexInput(event);
    } catch { /* Notifications must never interfere with Codex. */ }
    await forwardNotification(inputArgs.slice(1, -1), payload).catch(() => {});
    process.exit(0);
  }
  if (inputArgs[0] === "agent-event") {
    if (inputArgs.length === 1 || inputArgs.length === 2 && (inputArgs[1] === "claude-code" || inputArgs[1] === "pi"))
      await reportAgentEvent(inputArgs[1] === "pi" ? "pi" : inputArgs[1] === "claude-code" ? "claude-code" : "codex").catch(() => {});
    process.exit(0);
  }
  if (inputArgs[0] === "claude-hooks" && inputArgs[1] === "install" && inputArgs.length === 2) {
    printStatus('ok', `Installed observational hooks: ${await installClaudeHooks()}`);
    printStatus('info', 'Review AgentOnWeb session status in Claude Code /hooks, then start a new Claude Code session inside an AgentOnWeb terminal.');
    process.exit(0);
  }
  if (inputArgs[0] === "claude-hooks" && inputArgs[1] === "uninstall" && inputArgs.length === 2) {
    await uninstallClaudeHooks();
    printStatus('ok', 'AgentOnWeb Claude Code hooks removed; other settings preserved.');
    process.exit(0);
  }
  if (inputArgs[0] === "pi-extension" && inputArgs[1] === "install" && inputArgs.length === 2) {
    printStatus('ok', `Installed observational extension: ${await installPiExtension()}`);
    printStatus('info', 'Start Pi 1.1+ inside an AgentOnWeb terminal, or use /reload in Pi.');
    process.exit(0);
  }
  if (inputArgs[0] === "pi-extension" && inputArgs[1] === "uninstall" && inputArgs.length === 2) {
    await uninstallPiExtension();
    printStatus('ok', 'AgentOnWeb Pi extension removed; other settings preserved. Use /reload in Pi to unload it.');
    process.exit(0);
  }
  if (inputArgs[0] === "codex-hooks" && inputArgs[1] === "install" && inputArgs.length === 2) {
    printStatus('ok', `Installed observational hooks: ${await installCodexHooks()}`);
    printStatus('info', 'In Codex, open /hooks and review/trust AgentOnWeb session status hooks, then start a new session inside an AgentOnWeb terminal.');
    process.exit(0);
  }
  if (inputArgs[0] === "codex-hooks" && inputArgs[1] === "uninstall" && inputArgs.length === 2) {
    await uninstallCodexHooks();
    printStatus('ok', 'AgentOnWeb hooks removed and the previous notify command restored.');
    process.exit(0);
  }
  if (inputArgs[0] === "service") {
    try {
      await serviceCommand(inputArgs.slice(1));
    } catch (error) {
      printError(error);
      process.exit(1);
    }
    process.exit(0);
  }
  if (inputArgs.length && (inputArgs[0] !== "terminal" || inputArgs.slice(1).some((arg) => arg !== "--service"))) {
    throw new Error("Usage: aow setup | aow terminal | aow service install | aow --help");
  }
} catch (error) {
  printError(error); process.exit(1);
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
const agentSessions = new AgentSessions();
let agentEndpoint = "";
type HostedSession = { token: string; exited?: boolean; session: TerminalSession; name?: string; directory: string; directoryRefresh?: Promise<void> };
const sessions = new Map<string, HostedSession>();
const maintenance = new Maintenance();
const updates = new Updates(stateDirectory);
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
async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit) throw new RequestError(413, "Request body is too large.");
    chunks.push(buffer);
  }
  // Network chunks can end in the middle of a UTF-8 character.
  return Buffer.concat(chunks).toString("utf8");
}
function newSession() {
  if (maintenance.active) throw new RequestError(409, 'An update or restart is in progress. Try again when the service is ready.');
  if (sessions.size >= 8) throw new RequestError(409, "Close an unused terminal before opening another (maximum 8).");
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const item: HostedSession = { token, session: new TerminalSession(executable, args, cwd,
    { ...env, AOW_AGENT_ENDPOINT: agentEndpoint, AOW_AGENT_TOKEN: token }), directory: cwd };
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
  item.session.pty.onExit(() => { item.exited = true; clearTimeout(directoryTimer); output.dispose(); agentSessions.removeTerminal(id); });
  broadcastSessionNames();
  return id;
}
const adminSecret = randomBytes(32).toString("base64url");
const adminCookie = `aow_admin_${runtimeId.replaceAll("-", "_")}`;
function matchesSecret(value: string, secret: string): boolean {
  const actual = Buffer.from(value);
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function matchesCookie(cookie: string, name: string, secret: string): boolean {
  return cookie.split(";").some((part) => {
    const value = part.trim();
    if (!value.startsWith(`${name}=`)) return false;
    return matchesSecret(value.slice(name.length + 1), secret);
  });
}
const isAdmin = (cookie = "") => matchesCookie(cookie, adminCookie, adminSecret);
let secret = randomBytes(32).toString("base64url");
let nativePairBusy = false;
const nativeToken = randomBytes(32).toString("base64url");
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
      version: VERSION,
      managedService: inputArgs.includes('--service'),
      nativeToken,
      launchUrl: `${origin}/launch?token=${launchToken}`,
    }),
    { mode: 0o600 },
  );
  await rename(temp, join(stateDirectory, "endpoint.json"));
}
const publicRoot = new URL("./public/", import.meta.url);
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/service-control') {
      // Local CLI only: never accept a browser Origin or delegated/admin cookie.
      if (req.headers.origin || req.headers.host !== new URL(origin).host
        || !matchesSecret((req.headers.authorization ?? '').replace(/^Bearer /u, ''), nativeToken)) {
        res.writeHead(403).end(); return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        res.end(JSON.stringify({ version: VERSION, activeTerminals: [...sessions.values()].filter(item => !item.exited).length,
          managedService: inputArgs.includes('--service') })); return;
      }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      let action;
      try { action = JSON.parse(await readBody(req, 4096)); }
      catch { throw new RequestError(400, 'Invalid service action.'); }
      if (!action || typeof action !== 'object' || Array.isArray(action)) throw new RequestError(400, 'Invalid service action.');
      if (action.action === 'prepare' && (action.force === undefined || typeof action.force === 'boolean')) {
        try {
          const token = maintenance.prepare([...sessions.values()].filter(item => !item.exited).length, action.force === true);
          res.end(JSON.stringify({ token }));
        } catch (error) { throw new RequestError(409, (error as Error).message); }
      } else if (action.action === 'release' && typeof action.token === 'string') {
        maintenance.release(action.token); res.end('{}');
      } else throw new RequestError(400, 'Invalid service action.');
      return;
    }
    if (req.url === "/native-pair") {
      if (req.method !== "POST" || req.headers.origin || req.headers.host !== new URL(origin).host
        || !matchesSecret((req.headers.authorization ?? "").replace(/^Bearer /u, ""), nativeToken)) {
        res.writeHead(403).end(); return;
      }
      if (nativePairBusy) { res.writeHead(409).end(); return; }
      nativePairBusy = true;
      try {
        const body = await readBody(req, 4096);
        const input = JSON.parse(body);
        if (!(await nativeOrigins(stateDirectory)).includes(input.origin)) { res.writeHead(403).end(); return; }
        const receiptPath = join(stateDirectory, "native-paired-" + new URL(input.origin).hostname);
        let paired = false;
        try { await readFile(receiptPath); paired = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const canPair = !paired && !authority.snapshot().grants.some(g => g.origin === input.origin);
        if (input.type === "probe") {
          res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true, canPair })); return;
        }
        const pending = authority.snapshot().pending.find(p => p.origin === input.origin);
        if (input.type !== "pair" || !canPair || !pending) { res.writeHead(409).end(); return; }
        // Persist receipt before granting: revocation or clearing browser storage
        // must never cause silent re-authorization on the next reconnect.
        await writeFile(receiptPath, input.origin, { mode: 0o600 });
        await authority.decide(pending.id, true);
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true })); return;
      } finally { nativePairBusy = false; }
    }
    if (req.url === "/agent-event") {
      // No browser-origin requests or surface cookies can publish semantic events.
      if (req.method !== "POST" || req.headers.origin || req.headers.host !== new URL(agentEndpoint).host) {
        res.writeHead(403).end(); return;
      }
      const token = (req.headers.authorization ?? "").replace(/^Bearer /u, "");
      const terminal = [...sessions].find(([, item]) => !item.exited && matchesSecret(token, item.token));
      if (!terminal) { res.writeHead(403).end(); return; }
      const body = await readBody(req, 65_536);
      let input: unknown;
      try { input = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      res.writeHead(agentSessions.ingest(terminal[0], input) ? 204 : 400).end();
      return;
    }
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
    if (url.pathname === '/api/updates') {
      if (!isAdmin(req.headers.cookie) || req.headers['x-agentonweb-terminal'] !== '1'
        || req.headers.origin && req.headers.origin !== origin) { res.writeHead(403).end(); return; }
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ...await updates.status(), installedVersion: installedVersion(), runningVersion: VERSION })); return;
    }
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
        const body = await readBody(req, 4096);
        let action;
        try { action = JSON.parse(body); }
        catch { throw new RequestError(400, "Request body must be valid JSON."); }
        if (!action || typeof action !== "object" || Array.isArray(action))
          throw new RequestError(400, "Request body must be a JSON object.");
        if (url.pathname === "/api/connections") {
          if (action.action === "revoke") {
            const grant = authority.snapshot().grants.find(g => g.id === action.id);
            if (grant?.origin.startsWith("chrome-extension://"))
              await writeFile(join(stateDirectory, "native-paired-" + new URL(grant.origin).hostname), grant.origin, { mode: 0o600 });
            await authority.revoke(action.id);
          }
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
          agentSessions.removeTerminal(action.id);
          broadcastSessionNames();
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
    if (url.pathname === "/launch" && matchesSecret(url.searchParams.get("token") ?? "", launchToken)) {
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
agentEndpoint = `http://127.0.0.1:${address.port}/agent-event`;
newSession();
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
    agentSessions,
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
  `${terminalUi().banner('LOCAL SHELL')}\nExecutable: ${executable}\nInitial directory: ${cwd}\nConnector: ${connector.port}\nOpen once: ${origin}/launch?token=${launchToken}`,
);
printStatus('info', 'Approve your browser through the private setup page.');
await saveEndpoint();
const stopUpdateChecks = updates.start(status => {
  printStatus('warn', `AgentOnWeb ${status.latest} is available (running ${VERSION}). Run aow update after closing terminal sessions.`);
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  stopUpdateChecks();
  await cleanup([
    ...[...sessions.values()].map(({ session }) => () => session.dispose()),
    () => unlink(join(stateDirectory, "endpoint.json")).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    }),
    ...[...sockets.clients].map((ws) => () => ws.terminate()),
    () => connector.close(),
    () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      // Active HTTP requests must not leave shutdown waiting indefinitely.
      server.closeAllConnections();
    }),
    unlock,
  ]);
}
function onStopSignal() {
  void stop().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
process.on("SIGINT", onStopSignal);
process.on("SIGTERM", onStopSignal);
