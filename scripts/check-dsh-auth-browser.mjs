// Real-browser regression: a stale first-party DSH cookie must not shadow the
// session delegated to the embedded workspace. Dependencies stay in an isolated
// test prefix; see docs/verification/dsh-cookie-auth.md for the invocation.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({ options: {
  deps: { type: "string" }, dsh: { type: "string" }, chromium: { type: "string" },
} });
assert.ok(values.deps && values.chromium, "Required: --deps <npm test prefix> --chromium <executable> [--dsh <bin.js>]");
const { chromium } = await import(pathToFileURL(resolve(values.deps, "node_modules/playwright-core/index.mjs")));
const root = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(resolve(tmpdir(), "agentonweb-auth-"));
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
let runtime, context, connector;
let logs = "";
try {
  // Port 0 lets the DSH server choose an unused loopback port.
  runtime = spawn(process.execPath, [values.dsh ?? resolve(values.deps, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
    "web", "--no-open", "--port", "0"], {
    cwd: directory, env: { ...process.env, DSH_HOME: resolve(directory, "dsh-home") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  runtime.stdout.on("data", (chunk) => { logs += chunk; });
  runtime.stderr.on("data", (chunk) => { logs += chunk; });
  let launch;
  for (let count = 0; count < 180; count++) {
    launch = logs.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s\x1b]+/u)?.[0];
    if (launch || runtime.exitCode !== null) break;
    await delay(250);
  }
  assert.ok(launch, `DSH did not start: ${logs.replace(/token=[^\s]+/gu, "token=<redacted>").slice(-2000)}`);
  const launchUrl = new URL(launch);
  launchUrl.hostname = "localhost";
  const exchange = await fetch(launchUrl, { redirect: "manual" });
  assert.equal(exchange.status, 303);
  const cookie = exchange.headers.get("set-cookie");
  const [, name, value] = cookie.match(/^([^=;]+)=([^;]+);/u);
  const maxAgeSeconds = Number(cookie.match(/Max-Age=(\d+)/iu)[1]);
  const url = `${launchUrl.origin}/`;
  const surface = { runtimeId: "dsh-auth-regression", displayName: "DSH auth regression", url, cookie: { name, value, maxAgeSeconds } };
  const singleCookieStatus = (await fetch(url, { headers: { cookie: `${name}=${value}` } })).status;
  const staleFirstCookieStatus = (await fetch(url, { headers: { cookie: `${name}=stale-session; ${name}=${value}` } })).status;
  assert.equal(singleCookieStatus, 200);
  console.log(JSON.stringify({ singleCookieStatus, staleFirstCookieStatus }));

  // Use the actual connector, authorization, background and content scripts.
  await build({ entryPoints: [resolve(root, "packages/connector-host/src/server.ts")],
    outfile: resolve(directory, "connector.mjs"), bundle: true, platform: "node", format: "esm",
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    external: ["bufferutil", "utf-8-validate"],
  });
  const { startConnector, Authorization } = await import(pathToFileURL(resolve(directory, "connector.mjs")));
  const authority = await Authorization.open(resolve(directory, "grants"));
  connector = await startConnector({
    runtime: { id: surface.runtimeId, displayName: surface.displayName, surfaceKind: "web", capabilities: { translucency: true, optionTap: true } },
    approvalUrl: url, getSurface: async () => surface,
  }, authority);
  const extensionPath = resolve(root, "apps/extension/.output/chrome-mv3");
  context = await chromium.launchPersistentContext("", {
    executablePath: values.chromium, headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run"],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionOrigin = `chrome-extension://${new URL(worker.url()).hostname}`;
  await worker.evaluate(async ({ url, name }) => {
    await chrome.cookies.set({ url, name, value: "stale-session", path: "/", httpOnly: true, secure: false, sameSite: "strict" });
  }, { url, name });
  await context.route("https://www.youtube.com/**", (route) => route.fulfill({
    contentType: "text/html", body: "<html><body><h1>DSH authorized iframe regression</h1></body></html>",
  }));
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const worlds = [];
  session.on("Runtime.executionContextCreated", ({ context }) => worlds.push(context));
  await session.send("Runtime.enable");
  const statuses = [];
  page.on("response", (response) => {
    if (response.url().startsWith(url) && response.request().isNavigationRequest()) statuses.push(response.status());
  });
  await page.goto("https://www.youtube.com/");
  let contentWorld;
  for (let count = 0; count < 100; count++) {
    contentWorld = worlds.find((world) => world.origin === extensionOrigin);
    if (contentWorld) break;
    await delay(100);
  }
  assert.ok(contentWorld, "extension content script must be injected");
  const connected = await session.send("Runtime.evaluate", { contextId: contentWorld.id, awaitPromise: true, returnByValue: true,
    expression: `chrome.runtime.sendMessage(${JSON.stringify({ source: "agentonweb-content", type: "runtime.connect", runtimeId: surface.runtimeId })})`,
  });
  assert.equal(connected.result.value?.ok, true);
  let pending;
  for (let count = 0; count < 50; count++) {
    pending = authority.snapshot().pending.find((request) => request.origin === extensionOrigin);
    if (pending) break;
    await delay(100);
  }
  assert.ok(pending, "connector must request native approval");
  await authority.decide(pending.id, true);
  const grant = authority.snapshot().grants.find((grant) => grant.origin === extensionOrigin);
  let frame;
  for (let count = 0; count < 150; count++) {
    frame = page.frames().find((candidate) => candidate.url().startsWith(url));
    if (frame && statuses.length) break;
    await delay(100);
  }
  if (!frame) {
    const state = await session.send("Runtime.evaluate", { contextId: contentWorld.id, awaitPromise: true, returnByValue: true,
      expression: 'chrome.runtime.sendMessage({source:"agentonweb-content",type:"state.get"})',
    });
    console.log(JSON.stringify({ connection: state.result.value?.result?.connection, error: state.result.value?.error ?? state.result.value?.result?.error,
      surfacePresent: Boolean(state.result.value?.result?.surface), frames: page.frames().map(frame => frame.url().split("#")[0]) }));
  }
  assert.ok(frame, "authorized extension must mount the DSH iframe");
  const authError = (await frame.locator("body").innerText()).includes("dsh web authentication required");
  console.log(JSON.stringify({ browser: context.browser().version(), statuses, authError }));
  assert.equal(authError, false, "authorized iframe must not display dsh web authentication required");
  assert.equal(statuses.at(-1), 200);
  // Verify the rule also covers authenticated API traffic and WebSockets.
  const apiStatus = await frame.evaluate(async () => (await fetch("/api/agentonweb-auth-regression")).status);
  assert.equal(apiStatus, 404, "an unknown API route should pass auth before returning 404");
  const socketStatus = await frame.evaluate(() => new Promise((done) => {
    const socket = new WebSocket(`ws://${location.host}/api/remote.mux`);
    const timeout = setTimeout(() => { socket.close(); done("timeout"); }, 5000);
    socket.onopen = () => { clearTimeout(timeout); socket.close(); done("open"); };
    socket.onerror = () => { clearTimeout(timeout); done("error"); };
  }));
  assert.equal(socketStatus, "open", "native WebSocket handshake must authenticate");
  assert.equal(await worker.evaluate(async ({ url, name }) => (await chrome.cookies.get({ url, name }))?.value, { url, name }),
    "stale-session", "the user's first-party session must remain untouched");
  await authority.revoke(grant.id);
  for (let count = 0; count < 50; count++) {
    if ((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length === 0) break;
    await delay(100);
  }
  assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0,
    "revocation must remove the delegated session rules");
  console.log("PASS: iframe, API and WebSocket auth; native cookie preserved; revocation removes delegation.");
} finally {
  await context?.close();
  await connector?.close();
  if (runtime && runtime.exitCode === null && runtime.signalCode === null) {
    runtime.kill("SIGTERM");
    for (let count = 0; count < 20 && runtime.exitCode === null && runtime.signalCode === null; count++) await delay(100);
    if (runtime.exitCode === null && runtime.signalCode === null) runtime.kill("SIGKILL");
  }
  await rm(directory, { recursive: true, force: true });
}
