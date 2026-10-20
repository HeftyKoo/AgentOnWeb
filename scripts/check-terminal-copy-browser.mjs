// Real xterm and browser clipboard, with only the host transport replaced.
// Build the terminal surface first. The browser/profile are isolated.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { deps: { type: "string" }, chromium: { type: "string" } } });
assert.ok(values.deps && values.chromium, "Required: --deps <npm prefix> --chromium <executable>");
const { chromium } = await import(pathToFileURL(resolve(values.deps, "node_modules/playwright-core/index.mjs")));
const root = new URL("../apps/terminal-surface/dist/", import.meta.url);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/api/terminals" || path === "/ticket") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(path === "/api/terminals" ? [{ id: "one", name: "Copy fixture" }] : { token: "fixture" }));
    return;
  }
  const file = { "/": "index.html", "/main.js": "main.js", "/main.css": "main.css" }[path];
  if (!file) { response.statusCode = 404; response.end(); return; }
  response.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
  response.end(await readFile(new URL(file, root)));
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
let originalClipboard;
let page;
const copyText = text => {
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return copied;
};
try {
  browser = await chromium.launch({ executablePath: values.chromium, headless: false });
  const context = await browser.newContext({ permissions: ["clipboard-read"], viewport: { width: 1000, height: 600 } });
  page = await context.newPage();
  await page.addInitScript(() => {
    window.copyInputs = [];
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      constructor() {
        window.copySocket = this;
        setTimeout(() => {
          this.emit({ type: "snapshot", epoch: "one", cols: 100, rows: 30, data: "COPY_ME_123\r\n中文测试\r\n" });
          setTimeout(() => this.emit({ type: "control", epoch: "one", active: true, lease: 1, resizeOwner: true }), 50);
        }, 50);
      }
      emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
      send(data) {
        const message = JSON.parse(data);
        if (message.type === "input") window.copyInputs.push(message.data);
      }
      close() { this.readyState = 3; }
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByText("COPY_ME_123", { exact: true }).waitFor();
  originalClipboard = await page.evaluate(() => navigator.clipboard.readText());
  const screen = await page.locator(".xterm-screen").boundingBox();
  const row = await page.locator(".xterm-rows > div").first().boundingBox();
  const cellWidth = screen.width / 100;
  const point = (column, line = 0) => ({ x: screen.x + cellWidth * column, y: row.y + row.height * (line + 0.5) });
  const inputs = () => page.evaluate(() => window.copyInputs);
  const clearInputs = () => page.evaluate(() => { window.copyInputs = []; });
  const output = data => page.evaluate(data => window.copySocket.emit({ type: "output", epoch: "one", sequence: 1, data }), data);
  async function drag(start, end) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
  }
  async function copySelection(expected, position = point(2)) {
    await page.mouse.click(position.x, position.y, { button: "right" });
    const prepared = await page.locator(".xterm-helper-textarea").evaluate(area => area.value.slice(area.selectionStart, area.selectionEnd));
    assert.equal(prepared, expected, "right-click prepares the selection for the browser Copy menu item");
    // The browser's Copy menu command dispatches the same native copy event.
    assert.equal(await page.evaluate(() => document.execCommand("copy")), true);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
    await page.keyboard.press("Escape");
  }
  for (const mode of [0, 1000, 1002, 1003]) {
    await output("\x1b[?1000l\x1b[?1002l\x1b[?1003l" + (mode ? `\x1b[?${mode}h\x1b[?1006h` : ""));
    await page.waitForFunction(mode => document.querySelector(".xterm").classList.contains("enable-mouse-events") === Boolean(mode), mode);
    await clearInputs();
    await drag(point(0.2), point(11.3));
    // Any-event tracking legitimately sends hover reports before the drag.
    assert.equal((await inputs()).some(data => /\x1b\[<0;/u.test(data)), false, "text drags send no left-button press to the app");
    await copySelection("COPY_ME_123");
    await drag(point(8.3, 1), point(0.2, 1));
    await copySelection("中文测试", point(2, 1));
    if (mode) {
      await clearInputs();
      await page.mouse.click(point(30).x, point(30).y);
      assert.ok((await inputs()).some(data => data.startsWith("\x1b[<0;")), "a single click still reaches the app");
      assert.ok((await inputs()).some(data => data.endsWith("m")), "the app receives the matching release");
      await clearInputs();
      await page.mouse.wheel(0, 100);
      await page.waitForFunction(() => window.copyInputs.some(data => data.startsWith("\x1b[<65;")));
    }
    console.log(`PASS: mouse mode ${mode || "off"}: direct drag, reverse Unicode selection, right-click copy${mode ? ", app click and scroll" : ""}`);
  }
  await page.mouse.dblclick(point(2).x, point(2).y);
  await copySelection("COPY_ME_123");
  console.log("PASS: double-click selects a word while mouse reporting is active");
} finally {
  if (originalClipboard !== undefined) await page?.evaluate(copyText, originalClipboard).catch(() => {});
  await browser?.close();
  await new Promise(done => server.close(done));
}
