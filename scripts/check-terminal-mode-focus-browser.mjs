// Real Chrome + unpacked extension + isolated host. No installed service, user
// profile, Codex configuration, or real DSH workspace is changed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { deps: { type: "string" }, chromium: { type: "string" } } });
assert.ok(values.deps && values.chromium, "Required: --deps <npm prefix> --chromium <executable>");
const { chromium } = await import(pathToFileURL(resolve(values.deps, "node_modules/playwright-core/index.mjs")));
const root = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(resolve(tmpdir(), "aow-mode-focus-"));
const output = resolve(root, "output/terminal-mode-focus");
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
let runtime, browserProcess, browser, context;
let logs = "";
try {
  await cp(resolve(root, "packages/terminal-host/lib"), resolve(directory, "lib"), { recursive: true });
  await symlink(resolve(root, "packages/terminal-host/node_modules"), resolve(directory, "node_modules"));
  await writeFile(resolve(directory, "package.json"), '{"type":"module"}');
  const cli = resolve(directory, "lib/cli.js");
  const source = await readFile(cli, "utf8");
  assert.equal(source.split('var runtimeId = "terminal";').length, 2, "unique runtime identity substitution");
  await writeFile(cli, source.replace('var runtimeId = "terminal";', 'var runtimeId = "terminal-focus-qa";'));
  const hostHome = resolve(directory, "home");
  await mkdir(hostHome);
  const environment = { ...process.env, HOME: hostHome, SHELL: "/bin/sh" };
  for (const key of ["ENV", "BASH_ENV", "ZDOTDIR", "AOW_AGENT_ENDPOINT", "AOW_AGENT_TOKEN"]) delete environment[key];
  runtime = spawn(process.execPath, [cli, "terminal"], { cwd: hostHome, env: environment, stdio: ["ignore", "pipe", "pipe"] });
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
    window.modeFocusEvents = [];
    for (const type of ["focus", "blur", "focusin", "focusout"]) window.addEventListener(type, event => {
      window.modeFocusEvents.push({ at: Date.now(), type, target: event.target?.id || event.target?.tagName || "window", active: document.activeElement?.id || document.activeElement?.tagName });
    }, true);
    window.addEventListener("message", event => {
      if (event.data?.source?.startsWith("agentonweb-")) window.modeFocusEvents.push({ at: Date.now(), message: event.data.type, mode: event.data.mode });
    });
    window.modeKeyEvents = [];
    window.addEventListener("keydown", event => {
      window.modeKeyEvents.push({ code: event.code, ctrl: event.ctrlKey, alt: event.altKey, target: event.target?.tagName });
    }, true);
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      send(data) {
        const message = JSON.parse(data);
        if (["input", "input-binary"].includes(message.type)) (window.modeKeyInputs ??= []).push(message.data);
        super.send(data);
      }
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
  async function website(host) {
    await context.route(`https://${host}/**`, route => route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Review regression</title><h1>${host}: terminal mode shortcuts</h1><button id="website-control">Website keyboard target</button><input id="website-input" aria-label="Website input">` }));
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
    await message({ type: "runtime.connect", runtimeId: "terminal-focus-qa" });
    return { page, message };
  }
  const a = await website("aow-mode-focus.example");
  await admin.getByRole("button", { name: "Allow connection", exact: true }).click();
  await foreground(a.page);
  async function terminalFrame(page) {
    const frame = await until(() => page.frames().find(frame => frame.url().startsWith(origin + "/")), "embedded terminal frame");
    await until(async () => (await frame.locator(".terminal-tab[data-state=connected]").count()) > 0, "connected terminal");
    return frame;
  }
  const frameA = await terminalFrame(a.page);

  await worker.evaluate(() => {
    globalThis.modeCommands = [];
    globalThis.modeRequests = [];
    chrome.commands.onCommand.addListener(command => globalThis.modeCommands.push(command));
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === "mode.shortcut") globalThis.modeRequests.push(message.mode);
    });
  });
  const mode = () => a.page.locator("#agentonweb-extension-root").getAttribute("data-mode");
  const terminalFocused = () => frameA.evaluate(() => document.hasFocus() && document.activeElement?.classList.contains("xterm-helper-textarea"));
  const websiteFocused = () => a.page.evaluate(() => document.hasFocus() && document.activeElement?.id === "website-control");
  const press = async (digit, expected) => {
    await a.page.keyboard.press("Control+" + digit);
    try {
      await until(async () => await mode() === expected, "Control+" + digit + " switches to " + expected);
    } catch (error) {
      report.failureState = {
        page: await a.page.evaluate(() => ({ events: window.modeKeyEvents, focus: document.activeElement?.outerHTML, hasFocus: document.hasFocus() })),
        terminal: await frameA.evaluate(() => ({ events: window.modeKeyEvents, input: window.modeKeyInputs, hasFocus: document.hasFocus() })),
        delivery: await worker.evaluate(async () => ({ commands: globalThis.modeCommands, requests: globalThis.modeRequests, bindings: await chrome.commands.getAll() })),
      };
      throw error;
    }
  };
  await a.message({ type: "mode.set", mode: "focus" });
  await a.page.locator("#website-control").focus();
  await frameA.locator(".xterm-helper-textarea").focus();
  await until(terminalFocused, "initial native xterm input focus");
  await frameA.evaluate(() => { window.modeKeyInputs = []; });
  await press(1, "chill");
  assert.equal(await terminalFocused(), true, "Chill preserves native input focus");
  await press(2, "focus");
  await until(terminalFocused, "Focus targets native input");
  await press(3, "watch");
  await until(websiteFocused, "Watch restores the previous website button");
  await delay(300);
  assert.equal(await websiteFocused(), true, "Watch keeps website focus after iframe messages settle");
  await a.page.screenshot({ path: resolve(output, "watch-website-focus.png") });
  await press(1, "chill");
  assert.equal(await websiteFocused(), true, "Chill preserves website focus");
  await press(2, "focus");
  await until(terminalFocused, "Focus returns from website to terminal without a mouse");
  await press(2, "focus");
  await until(terminalFocused, "reselecting Focus keeps the input active");
  passed("Control+1/2/3 from real focused xterm, with Watch restoring the website and keyboard-only return to Focus");
  for (let round = 0; round < 5; round++) {
    await press(1, "chill");
    assert.equal(await terminalFocused(), true);
    await press(2, "focus");
    await until(terminalFocused, "loop Focus input");
    await press(3, "watch");
    await until(websiteFocused, "loop Watch website");
    await press(2, "focus");
    await until(terminalFocused, "loop return to terminal");
  }
  assert.deepEqual(await frameA.evaluate(() => window.modeKeyInputs), [], "mode keys must not leak bytes into PTY input");
  passed("five repeated keyboard-only mode cycles with no shortcut bytes sent to the shell");
  for (let update = 0; update < 15; update++) {
    await a.message({ type: "opacity.set", opacity: update % 2 ? 0.7 : 0.8 });
    assert.equal(await terminalFocused(), true);
  }
  const text = 'printf "%s\\n" AOW_"MODE_KEYS_OK"';
  await a.page.keyboard.type(text);
  await a.page.keyboard.press("Enter");
  await until(async () => (await frameA.locator(".xterm-rows").innerText()).includes("AOW_MODE_KEYS_OK"), "real shell input after mode switches");
  passed("15 background presentation updates retain focus, followed by successful real PTY input");
  await a.page.screenshot({ path: resolve(output, "focus-terminal-input.png") });
  const delivery = await worker.evaluate(() => ({ browserCommands: globalThis.modeCommands, iframeOrPageFallback: globalThis.modeRequests }));
  report.shortcutDelivery = delivery;
  assert.ok(delivery.iframeOrPageFallback.includes("watch"), "real browser exercised the iframe shortcut fallback");
  passed("observed actual extension mode requests from browser keyboard events", delivery);
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.focusTrace = await Promise.all((context?.pages() ?? []).flatMap(page => page.frames()).map(async frame => ({ origin: new URL(frame.url()).origin, trace: await frame.evaluate(() => window.modeFocusEvents).catch(() => []) })));
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
