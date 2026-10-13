// Real Chrome + unpacked extension + isolated host. No installed service, user
// profile, Codex configuration, or real DSH workspace is changed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { deps: { type: "string" }, chromium: { type: "string" } } });
assert.ok(values.deps && values.chromium, "Required: --deps <npm prefix> --chromium <executable>");
const { chromium } = await import(pathToFileURL(resolve(values.deps, "node_modules/playwright-core/index.mjs")));
const root = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(resolve(tmpdir(), "aow-review-"));
const output = resolve(root, "output/review-regressions");
await mkdir(output, { recursive: true });
const delay = ms => new Promise(done => setTimeout(done, ms));
async function until(check, label, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
const report = { startedAt: new Date().toISOString(), checks: [] };
function passed(name, evidence = {}) { report.checks.push({ name, ...evidence }); console.log(`PASS: ${name}`); }
let runtime, browserProcess, browser, context, fixture;
let logs = "";
try {
  await cp(resolve(root, "packages/terminal-host/lib"), resolve(directory, "lib"), { recursive: true });
  await symlink(resolve(root, "packages/terminal-host/node_modules"), resolve(directory, "node_modules"));
  await writeFile(resolve(directory, "package.json"), '{"type":"module"}');
  const cli = resolve(directory, "lib/cli.js");
  const source = await readFile(cli, "utf8");
  assert.equal(source.split('var runtimeId = "terminal";').length, 2, "unique runtime identity substitution");
  await writeFile(cli, source.replace('var runtimeId = "terminal";', 'var runtimeId = "terminal-review-qa";'));
  const home = resolve(directory, "home");
  await mkdir(home);
  const environment = { ...process.env, HOME: home, SHELL: "/bin/sh" };
  for (const key of ["ENV", "BASH_ENV", "ZDOTDIR", "AOW_AGENT_ENDPOINT", "AOW_AGENT_TOKEN"]) delete environment[key];
  runtime = spawn(process.execPath, [cli, "terminal"], { cwd: home, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  await once(runtime, "spawn");
  runtime.stdout.on("data", chunk => { logs += chunk; });
  runtime.stderr.on("data", chunk => { logs += chunk; });
  const launch = await until(() => logs.match(/http:\/\/localhost:\d+\/launch\?token=[^\s]+/u)?.[0], "isolated host launch");
  const origin = new URL(launch).origin;
  const extensionPath = resolve(directory, "extension");
  await cp(resolve(root, "apps/extension/.output/chrome-mv3"), extensionPath, { recursive: true });
  const manifestFile = resolve(extensionPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  // Native host registrations are machine-wide even with a fresh profile.
  // This run explicitly tests manual approval against its isolated host.
  manifest.permissions = manifest.permissions.filter(permission => permission !== "nativeMessaging");
  await writeFile(manifestFile, JSON.stringify(manifest));
  const profile = resolve(directory, "profile");
  // Connect without Playwright's focus emulation so tab switching produces real
  // visibility events. The launched Chrome remains visible throughout the run.
  browserProcess = spawn(values.chromium, [`--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1280,900",
    `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--no-default-browser-check",
    "--use-mock-keychain", "--password-store=basic", "--disable-sync", "--disable-background-networking",
    "--disable-search-engine-choice-screen", "--disable-features=HttpsUpgrades"], { stdio: "ignore" });
  await once(browserProcess, "spawn");
  const debugPort = await until(async () => (await readFile(resolve(profile, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0], "isolated Chrome debugging port");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { noDefaults: true });
  context = browser.contexts()[0];
  report.browser = browser.version();
  await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.reviewSockets = [];
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) { super(...args); window.reviewSockets.push(this); }
    };
  });
  const worker = await until(async () => {
    for (const candidate of context.serviceWorkers()) {
      if (new URL(candidate.url()).pathname !== "/background.js") continue;
      if (await candidate.evaluate(() => chrome.runtime.getManifest().name).catch(() => "") === "AgentOnWeb") return candidate;
    }
  }, "AgentOnWeb extension worker");
  // Chromium URL.origin is "null" for chrome-extension URLs in Node.
  const contentOrigin = `chrome-extension://${new URL(worker.url()).hostname}`;
  async function foreground(page) {
    await page.bringToFront();
    await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
      if (!tab) throw new Error("Test tab missing");
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    }, page.url());
    await until(() => page.evaluate(() => document.hasFocus() && !document.hidden), "foreground browser focus");
  }
  const admin = await context.newPage();
  await admin.goto(launch);
  async function api(action) {
    return admin.evaluate(async action => {
      const response = await fetch("/api/terminals", { method: "POST", headers: { "content-type": "application/json", "X-AgentOnWeb-Terminal": "1" }, body: JSON.stringify(action) });
      if (!response.ok) throw new Error(`Terminal action: ${response.status}`);
      return response.json();
    }, action);
  }
  async function website(host) {
    await context.route(`https://${host}/**`, route => route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Review regression</title><h1>${host}: AgentOnWeb regression</h1>` }));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const worlds = [];
    cdp.on("Runtime.executionContextCreated", ({ context }) => worlds.push(context));
    await cdp.send("Runtime.enable");
    await page.goto(`https://${host}/`);
    const world = await until(() => worlds.find(item => item.origin === contentOrigin), "extension content world");
    const message = async payload => {
      const result = await cdp.send("Runtime.evaluate", { contextId: world.id, awaitPromise: true, returnByValue: true,
        expression: `chrome.runtime.sendMessage(${JSON.stringify({ source: "agentonweb-content", ...payload })})` });
      assert.equal(result.result.value?.ok, true, "extension command");
      return result.result.value.result;
    };
    await message({ type: "runtime.connect", runtimeId: "terminal-review-qa" });
    return { page, message };
  }
  const a = await website("aow-review-a.example");
  await admin.getByRole("button", { name: "Allow connection", exact: true }).click();
  await foreground(a.page);
  async function terminalFrame(page) {
    const frame = await until(() => page.frames().find(frame => frame.url().startsWith(origin + "/")), "embedded terminal frame");
    await until(async () => (await frame.locator(".terminal-tab[data-state=connected]").count()) > 0, "connected terminal");
    return frame;
  }
  const frameA = await terminalFrame(a.page);
  const b = await website("aow-review-b.example");
  await foreground(b.page);
  const frameB = await terminalFrame(b.page);
  passed("real extension approval and terminal iframe on two website partitions");
  const first = await frameB.locator(".terminal-tab").first().getAttribute("data-session");
  await frameB.evaluate(() => { window.originalReviewTab = document.querySelector(".terminal-tab"); });
  await frameB.locator(".xterm-screen").click({ position: { x: 100, y: 50 } });
  await until(() => frameB.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea")), "terminal input focused before registry update");
  const added = await api({ action: "new" });
  await until(async () => await frameB.locator(".terminal-tab").count() === 2 && await frameA.locator(".terminal-tab").count() === 2, "remote tab creation");
  await api({ action: "rename", id: added.id, name: "中文工作区 🧪" });
  await until(async () => await frameB.locator(".tab-name").allTextContents().then(names => names.includes("中文工作区 🧪")), "Unicode name broadcast");
  await api({ action: "close", id: added.id });
  await until(async () => await frameB.locator(".terminal-tab").count() === 1 && await frameA.locator(".terminal-tab").count() === 1, "remote tab deletion");
  assert.equal(await frameB.evaluate(() => document.querySelector(".terminal-tab") === window.originalReviewTab), true);
  assert.equal(await frameB.locator(".terminal-tab").first().getAttribute("data-session"), first);
  assert.equal(await frameB.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea")), true);
  passed("multi-page create/rename/close updates without replacing the focused terminal tab");

  let outages = 0;
  await b.page.route(`${origin}/api/terminals`, route => {
    if (route.request().method() === "GET" && outages < 2) { outages++; return route.fulfill({ status: 503, body: "temporary outage" }); }
    return route.continue();
  });
  await frameB.evaluate(() => { for (const socket of window.reviewSockets) if (socket.url.endsWith("/terminal") && socket.readyState === 1) socket.close(4000, "regression outage"); });
  await until(() => outages === 2, "two failed reconnect HTTP attempts", 15_000);
  await until(async () => await frameB.locator(".terminal-tab[data-state=connected]").count() === 1, "automatic third reconnect", 20_000);
  await frameB.locator(".xterm-helper-textarea").focus();
  await b.page.keyboard.type('printf "%s\\n" REVIEW_REAL_"PTY_OK"');
  await b.page.keyboard.press("Enter");
  await until(async () => (await frameB.locator(".xterm-rows").innerText()).includes("REVIEW_REAL_PTY_OK"), "real PTY input after reconnection");
  passed("automatic recovery after two HTTP 503 responses, followed by real PTY input", { failedHttpAttempts: outages });
  await b.page.screenshot({ path: resolve(output, "terminal-recovered.png") });

  const cookieName = "aow_terminal_review_qa";
  const cookies = () => worker.evaluate(name => chrome.cookies.getAll({ name, partitionKey: {} }), cookieName);
  const cookie = (await cookies()).find(cookie => cookie.partitionKey?.topLevelSite === "https://aow-review-b.example");
  assert.ok(cookie, "partitioned terminal credential");
  const removed = await worker.evaluate(({ origin, cookie }) => chrome.cookies.remove({ url: origin.replace("http:", "https:") + "/", name: cookie.name, partitionKey: cookie.partitionKey }), { origin, cookie });
  assert.ok(removed, "Chrome removed the partitioned cookie");
  await until(async () => (await cookies()).some(item => item.partitionKey?.topLevelSite === cookie.partitionKey.topLevelSite), "deleted cookie reinstalled");
  const expiration = (await cookies()).find(item => item.partitionKey?.topLevelSite === cookie.partitionKey.topLevelSite).expirationDate;
  try {
    await worker.evaluate(() => { globalThis.reviewRealNow = Date.now; Date.now = () => globalThis.reviewRealNow() + 86_400_000; });
    await b.message({ type: "state.get" });
    await until(async () => (await cookies()).some(item => item.partitionKey?.topLevelSite === cookie.partitionKey.topLevelSite && item.expirationDate > expiration + 80_000), "expired lease renewed");
  } finally { await worker.evaluate(() => { Date.now = globalThis.reviewRealNow; delete globalThis.reviewRealNow; }); }
  passed("real Chrome cookie deletion invalidation and expired surface renewal");

  const grantsFile = resolve(home, ".agentonweb/terminal/connections.json");
  await rename(grantsFile, grantsFile + ".backup");
  await mkdir(grantsFile);
  try {
    await foreground(admin);
    const failure = admin.waitForResponse(response => response.url() === origin + "/api/connections" && response.request().method() === "POST");
    await admin.getByRole("button", { name: "Revoke", exact: true }).click();
    assert.equal((await failure).status(), 500);
    await until(async () => await admin.getByRole("button", { name: "Revoke", exact: true }).isEnabled(), "revocation retry enabled");
    assert.equal(await admin.evaluate(async () => (await (await fetch("/api/connections", { headers: { "X-AgentOnWeb-Terminal": "1" } })).json()).grants.length), 1);
  } finally { await rm(grantsFile, { recursive: true }); await rename(grantsFile + ".backup", grantsFile); }
  await admin.getByRole("button", { name: "Revoke", exact: true }).click();
  await until(async () => await admin.getByRole("button", { name: "Revoke", exact: true }).count() === 0, "successful retry removes grant");
  await until(async () => (await cookies()).every(item => !item.partitionKey), "revocation removes delegated cookies");
  passed("failed grant persistence keeps authorization visible and retryable; successful retry removes delegation");

  // DSH uses the actual built plugin with its documented sessions interface.
  // The surrounding native session store is a fixture; no model is invoked.
  const plugin = await readFile(resolve(root, "packages/dsh-surface-plugin/lib/client.js"), "utf8");
  let bookmark = { sessionId: "saved" }, posts = 0;
  fixture = createServer(async (req, res) => {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end('<!doctype html><title>DSH regression fixture</title><iframe src="/native#agentonweb=review-fixture" style="width:95vw;height:85vh"></iframe>');
      return;
    }
    if (req.url === "/plugin.js") { res.setHeader("content-type", "text/javascript"); res.end(plugin); return; }
    if (req.url === "/api/agentonweb/native-view") {
      if (req.method === "POST") { let body = ""; for await (const chunk of req) body += chunk; bookmark = JSON.parse(body); posts++; }
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ selection: bookmark })); return;
    }
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><title>DSH native selection fixture</title><h1>DSH native session interface</h1><button id="choose">Choose another session</button><output id="selection"></output><script>
      window.__ModuleLoader__ = { load(entry) { window.plugin = entry.factory(); } };
      window.current = "saved"; window.listeners = []; window.refreshes = 0;
      window.select = id => { window.current = id; document.querySelector('#selection').textContent = id; for (const listener of window.listeners) listener(); };
      document.querySelector('#choose').onclick = () => window.select('chosen');
      window.sessions = { list: { getSnapshot: () => ({ current: window.current, phase: 'ready', byId: {saved:{},chosen:{},stale:{}} }), subscribe: fn => { window.listeners.push(fn); return () => {}; } },
        refresh: () => { window.refreshes++; return window.holdRefresh ? new Promise(resolve => { window.releaseRefresh = resolve; }) : Promise.resolve(); }, refreshSubagents: async () => {}, open: window.select, clear: () => window.select(''), openSubagent: () => {} };
      window.start = () => window.plugin.apply({ theme: { overrideTokens: () => () => {} }, sessions: window.sessions, effect: setup => setup() });
    </script><script src="/plugin.js"></script>`);
  });
  await new Promise(done => fixture.listen(0, "127.0.0.1", done));
  const dshPage = await context.newPage();
  await dshPage.goto(`http://127.0.0.1:${fixture.address().port}/`);
  await foreground(dshPage);
  const dsh = await until(() => dshPage.frames().find(frame => frame.url().includes("/native#")), "DSH fixture iframe");
  await dsh.evaluate(() => { window.holdRefresh = true; window.start(); });
  await until(() => dsh.evaluate(() => !!window.releaseRefresh), "DSH refresh in flight");
  await dsh.locator("#choose").click();
  await dsh.evaluate(() => { window.holdRefresh = false; window.releaseRefresh(); });
  await until(() => bookmark.sessionId === "chosen", "user selection saved during restore");
  assert.equal(await dsh.locator("#selection").innerText(), "chosen");
  await dshPage.screenshot({ path: resolve(output, "dsh-selection-fixture.png") });
  const beforeHidden = posts;
  await foreground(admin);
  await until(() => dsh.evaluate(() => document.visibilityState === "hidden"), "real hidden browser tab");
  await dsh.evaluate(() => window.select("stale"));
  await delay(300);
  assert.equal(posts, beforeHidden);
  assert.equal(bookmark.sessionId, "chosen");
  passed("actual DSH plugin preserves mid-refresh selection and blocks writes from a previously visible hidden tab", { environment: "real Chrome, native sessions interface fixture" });
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.error = (error.stack ?? String(error)).replace(/token=[^\s]+/gu, "token=<redacted>");
  await context?.pages().at(-1)?.screenshot({ path: resolve(output, "failure.png"), timeout: 5000 }).catch(() => {});
  throw new Error(report.error);
} finally {
  const cleanupErrors = [];
  await browser?.close().catch(error => cleanupErrors.push(`browser: ${error}`));
  if (browserProcess && browserProcess.exitCode === null && browserProcess.signalCode === null) {
    browserProcess.kill("SIGTERM");
    await until(() => browserProcess.exitCode !== null || browserProcess.signalCode !== null, "isolated Chrome stopped", 5000)
      .catch(error => cleanupErrors.push(`Chrome process: ${error}`));
  }
  await new Promise((done, reject) => fixture ? fixture.close(error => error ? reject(error) : done()) : done())
    .catch(error => cleanupErrors.push(`fixture: ${error}`));
  if (runtime && runtime.exitCode === null && runtime.signalCode === null) {
    runtime.kill("SIGTERM");
    await until(() => runtime.exitCode !== null || runtime.signalCode !== null, "isolated host stopped", 5000).catch(async () => {
      runtime.kill("SIGKILL");
      await until(() => runtime.exitCode !== null || runtime.signalCode !== null, "isolated host killed", 5000)
        .catch(error => cleanupErrors.push(`host: ${error}`));
    });
  }
  if (!cleanupErrors.length) await rm(directory, { recursive: true, force: true }).catch(error => cleanupErrors.push(`files: ${error}`));
  report.cleanedUp = cleanupErrors.length === 0;
  if (cleanupErrors.length) report.cleanupErrors = cleanupErrors;
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  assert.equal(report.cleanedUp, true, cleanupErrors.join("\n"));
}
