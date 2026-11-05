// Real terminal surface with a deterministic, local transport fixture.
// No installed host, browser profile or running shell is touched.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  deps: { type: "string" }, chromium: { type: "string" }, profile: { type: "string" },
  assets: { type: "string" }, history: { type: "string", default: "3000" },
  columns: { type: "string", default: "120" }, rows: { type: "string", default: "40" },
  scroll: { type: "boolean", default: false },
  dom: { type: "boolean", default: false },
  screenshot: { type: "string" },
  live: { type: "boolean", default: false },
} });
assert.ok(values.deps && values.chromium, "Required: --deps <npm prefix> --chromium <executable>");
const { chromium } = await import(pathToFileURL(resolve(values.deps, "node_modules/playwright-core/index.mjs")));
const root = values.assets ? pathToFileURL(resolve(values.assets) + "/") : new URL("../apps/terminal-surface/dist/", import.meta.url);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/api/terminals" || path === "/ticket") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(path === "/api/terminals" ? [{ id: "perf", name: "Performance fixture" }] : { token: "fixture" }));
    return;
  }
  const file = { "/": "index.html", "/main.js": "main.js", "/main.css": "main.css" }[path];
  if (!file) { response.statusCode = 404; response.end(); return; }
  response.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
  response.end(await readFile(new URL(file, root)));
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({ executablePath: values.chromium, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ history, columns, rows, scroll, dom, live }) => {
    if (dom) Object.defineProperty(window, "WebGL2RenderingContext", { value: undefined });
    const fixture = window.perfFixture = { sequence: 0, ack: 0, inputs: [], frames: [], longTasks: [], running: false };
    new PerformanceObserver(list => {
      if (fixture.running) fixture.longTasks.push(...list.getEntries().map(entry => entry.duration));
    }).observe({ type: "longtask", buffered: false });
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      constructor() {
        fixture.socket = this;
        setTimeout(() => {
          const historyLines = Array.from({ length: 10 }, (_, row) => Array.from({ length: columns }, (_, i) => `\x1b[${41 + i % 6}m${(i + row) % 10}`).join("") + "\x1b[0m\r\n");
          fixture.historyLines = historyLines;
          const data = scroll ? Array.from({ length: history }, (_, row) => historyLines[row % 10]).join("") : "history line\r\n".repeat(history);
          this.emit({ type: "snapshot", epoch: "perf", cols: columns, rows, data });
          this.emit({ type: "control", epoch: "perf", active: true, lease: 1, resizeOwner: false });
          fixture.output("");
        }, 0);
      }
      emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
      send(data) {
        const message = JSON.parse(data);
        if (message.type === "ack") fixture.ack = message.sequence;
        if (message.type === "input") fixture.inputs.push(message.data);
      }
      close() { this.readyState = 3; }
    };
    fixture.output = data => fixture.socket.emit({ type: "output", epoch: "perf", sequence: ++fixture.sequence, data });
    fixture.presentation = mode => window.dispatchEvent(new MessageEvent("message", {
      source: window, origin: "chrome-extension://fixture",
      data: { source: "agentonweb-extension", nonce: "fixture", type: "mode.set", mode },
    }));
    fixture.start = () => {
      fixture.frames = []; fixture.inputs = []; fixture.longTasks = []; fixture.running = true;
      let previous = performance.now();
      const frame = now => {
        if (!fixture.running) return;
        fixture.frames.push(now - previous); previous = now; fixture.frameId = requestAnimationFrame(frame);
      };
      fixture.frameId = requestAnimationFrame(frame);
      if (scroll) {
        let line = 0;
        if (live) fixture.timer = setInterval(() => fixture.output(fixture.historyLines[line++ % 10]), 32);
        return;
      }
      let count = 0;
      const screens = Array.from({ length: 10 }, (_, frame) => {
        const line = Array.from({ length: columns }, (_, i) => `\x1b[${41 + i % 6}m${(i + frame) % 10}`).join("") + "\x1b[0m";
        return "\x1b[H" + Array.from({ length: rows - 1 }, () => line).join("\r\n");
      });
      fixture.timer = setInterval(() => {
        fixture.output(screens[count++ % screens.length] + `\r\nframe ${count}`);
      }, 32);
    };
  }, { history: Number(values.history), columns: Number(values.columns), rows: Number(values.rows), scroll: values.scroll, dom: values.dom, live: values.live });
  await page.goto(`http://127.0.0.1:${server.address().port}/#agentonweb=fixture`);
  await page.waitForFunction(() => window.perfFixture.ack === 1);
  await page.locator(".xterm-helper-textarea").focus();
  if (values.scroll) await page.addStyleTag({ content: ".xterm-viewport::-webkit-scrollbar{width:14px}.xterm-viewport::-webkit-scrollbar-thumb{background:#888;min-height:20px}.xterm-viewport::-webkit-scrollbar-track{background:#222}" });
  const client = await page.context().newCDPSession(page);
  // Keep the latency budget useful on fast development machines too.
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  if (values.profile) { await client.send("Profiler.enable"); await client.send("Profiler.start"); }
  const results = [];
  const scenarios = values.scroll ? [{ mode: "chill", action: "wheel" }, { mode: "chill", action: "drag" }]
    : [{ mode: "focus", action: "typing" }, { mode: "chill", action: "typing" }];
  for (const { mode, action } of scenarios) {
    await page.evaluate(mode => window.perfFixture.presentation(mode), mode);
    const viewport = page.locator(".xterm-viewport");
    if (values.scroll) {
      await viewport.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    }
    const scrollBefore = await viewport.evaluate(element => element.scrollTop);
    const bounds = await viewport.boundingBox();
    if (values.scroll) {
      await page.mouse.move(bounds.x + (action === "drag" ? bounds.width - 7 : bounds.width / 2), bounds.y + (action === "drag" ? bounds.height - 10 : bounds.height / 2));
      if (action === "drag" && values.screenshot) await page.screenshot({ path: values.screenshot });
      if (action === "drag") await page.mouse.down();
    }
    await page.evaluate(() => window.perfFixture.start());
    const keyLatency = [];
    for (let i = 0; i < 24; i++) {
      await new Promise(done => setTimeout(done, 40));
      const start = performance.now();
      if (values.scroll) {
        if (action === "wheel") await page.mouse.wheel(0, -600);
        else await page.mouse.move(bounds.x + bounds.width - 7, bounds.y + bounds.height - 10 - (i + 1) / 24 * (bounds.height - 40));
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      } else await page.keyboard.type("x");
      keyLatency.push(performance.now() - start);
    }
    if (action === "drag") await page.mouse.up();
    await page.evaluate(() => clearInterval(window.perfFixture.timer));
    await page.waitForFunction(() => window.perfFixture.ack === window.perfFixture.sequence);
    const result = await page.evaluate(() => {
      const f = window.perfFixture;
      f.running = false;
      cancelAnimationFrame(f.frameId);
      return { inputs: f.inputs.join(""), frames: f.frames, longTasks: f.longTasks,
        renderer: document.querySelector(".xterm-rows") ? "dom" : "webgl" };
    });
    const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? 0;
    results.push({ mode, action, renderer: result.renderer, actionP95: Math.round(percentile(keyLatency, 0.95)), actionMax: Math.round(Math.max(...keyLatency)),
      frameP95: Math.round(percentile(result.frames, 0.95)), longTasks: result.longTasks.length });
    if (values.scroll) {
      const actual = await viewport.evaluate(element => ({ top: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight, width: element.clientWidth, outerWidth: element.offsetWidth }));
      assert.ok(actual.top < scrollBefore - 1000, `${action} must actually scroll through history: ${JSON.stringify({ scrollBefore, actual, bounds })}`);
    }
    else assert.equal(result.inputs, "x".repeat(24), "typing must stay ordered and lossless during output");
  }
  if (values.profile) {
    const { profile } = await client.send("Profiler.stop");
    await writeFile(values.profile, JSON.stringify(profile));
  }
  console.log(JSON.stringify(results, null, 2));
  assert.deepEqual(errors, []);
  for (const result of results) {
    assert.ok(result.actionP95 < 100, `${result.mode} ${result.action}: p95 response ${result.actionP95} ms exceeds 100 ms`);
    const frameBudget = values.scroll ? 50 : 100;
    assert.ok(result.frameP95 < frameBudget, `${result.mode}: p95 frame interval ${result.frameP95} ms exceeds ${frameBudget} ms`);
  }
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
