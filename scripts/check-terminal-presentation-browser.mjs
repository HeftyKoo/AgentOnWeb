// Pixel-level transparency/selection checks against the real terminal bundle.
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
    response.end(JSON.stringify(path === "/api/terminals" ? [{ id: "one", name: "Pixel fixture" }] : { token: "fixture" }));
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
  browser = await chromium.launch({ executablePath: values.chromium, headless: true });
  const results = {};
  for (const renderer of ["dom", "webgl"]) {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(renderer => {
      if (renderer === "dom") Object.defineProperty(window, "WebGL2RenderingContext", { value: undefined });
      const fixture = window.pixelFixture = { inputs: [], ack: 0 };
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 1;
        constructor() {
          fixture.socket = this;
          setTimeout(() => {
            const data = "\x1b[38;2;241;243;245m"
              + "\x1b[48;2;32;71;51m    ███ Truecolor\x1b[0m\r\n"
              + "\x1b[42m    ███ ANSI\x1b[0m\r\n"
              + "\x1b[48;5;22m    ███ Palette\x1b[0m\r\n"
              + "\x1b[7m    ███ Inverse\x1b[0m\r\n"
              + "Plain text\r\n\r\n\r\n";
            this.emit({ type: "snapshot", epoch: "one", cols: 60, rows: 20, data });
            this.emit({ type: "control", epoch: "one", active: true, lease: 1, resizeOwner: false });
            this.emit({ type: "output", epoch: "one", sequence: 1, data: "" });
          }, 0);
        }
        emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
        send(data) {
          const message = JSON.parse(data);
          if (message.type === "ack") fixture.ack = message.sequence;
          if (message.type === "input") fixture.inputs.push(message.data);
        }
        close() {}
      };
      fixture.emit = message => window.dispatchEvent(new MessageEvent("message", {
        source: window, origin: "chrome-extension://fixture",
        data: { source: "agentonweb-extension", nonce: "fixture", ...message },
      }));
    }, renderer);
    await page.goto(`http://127.0.0.1:${server.address().port}/#agentonweb=fixture`);
    await page.waitForFunction(() => window.pixelFixture.ack === 1);
    await page.locator(".xterm-helper-textarea").focus();
    const settle = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const presentation = async (mode, opacity) => {
      await page.evaluate(({ mode, opacity }) => {
        window.pixelFixture.emit({ type: "mode.set", mode });
        window.pixelFixture.emit({ type: "opacity.set", opacity });
      }, { mode, opacity });
      await settle();
    };
    const bounds = await page.locator(".xterm-screen").boundingBox();
    const point = (column, row) => ({ x: bounds.x + column * bounds.width / 60, y: bounds.y + row * bounds.height / 20 });
    const points = [point(1.5, 0.5), point(1.5, 1.5), point(1.5, 2.5), point(1.5, 3.5),
      point(5.5, 0.5), point(0.5, 7.5), point(1.5, 6.5)];
    const pixels = async () => {
      const png = await page.screenshot({ omitBackground: true });
      return page.evaluate(async ({ png, points }) => {
        const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        const result = points.map(({ x, y }) => [...context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data]);
        bitmap.close();
        return result;
      }, { png: png.toString("base64"), points });
    };
    await presentation("chill", 0.4);
    assert.equal(await page.locator(".xterm-rows").count(), renderer === "dom" ? 1 : 0);
    const translucent = await pixels();
    await page.mouse.move(point(1.05, 0.5).x, point(1.05, 0.5).y);
    await page.mouse.down();
    await page.mouse.move(point(3.95, 0.5).x, point(3.95, 0.5).y, { steps: 8 });
    await page.mouse.up();
    await settle();
    const selected = await pixels();
    assert.equal(selected[0][3], 255, `${renderer}: selected background remains opaque`);
    await page.mouse.click(point(30, 6.5).x, point(30, 6.5).y);
    await presentation("chill", 0.2);
    const lower = await pixels();
    await presentation("focus", 0.2);
    const opaque = await pixels();
    results[renderer] = { translucent, lower, opaque };
    for (let i = 0; i < 4; i++) {
      assert.ok(translucent[i][3] < 255 && lower[i][3] < translucent[i][3], `${renderer}: cell background follows opacity`);
      assert.equal(opaque[i][3], 255, `${renderer}: Focus background is opaque`);
    }
    assert.deepEqual(translucent[4], opaque[4], `${renderer}: text must not fade`);
    assert.equal(translucent[5][3], 255, `${renderer}: block cursor must not fade`);
    if (renderer === "webgl") {
      await page.evaluate(() => { window.pixelFixture.canvas = [...document.querySelectorAll(".xterm-screen canvas")].find(canvas => canvas.getContext("webgl2")); });
      for (let i = 0; i < 3; i++) { await presentation("chill", 0.4); await presentation("focus", 0.4); }
      assert.equal(await page.evaluate(() => window.pixelFixture.canvas?.isConnected), true, "mode changes retain the same GPU canvas");
      await presentation("chill", 0.4);
      await page.evaluate(async () => {
        const canvas = window.pixelFixture.canvas;
        const extension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
        const restored = new Promise(done => canvas.addEventListener("webglcontextrestored", done, { once: true }));
        canvas.addEventListener("webglcontextlost", () => setTimeout(() => extension.restoreContext(), 50), { once: true });
        extension.loseContext();
        await restored;
      });
      await settle();
      const restored = await pixels();
      for (let channel = 0; channel < 4; channel++) assert.ok(Math.abs(restored[0][channel] - translucent[0][channel]) <= 3, "restored GPU context keeps cell opacity");
      await page.evaluate(() => window.pixelFixture.canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext());
      await page.locator(".xterm-rows").waitFor();
      await settle();
      const fallback = await pixels();
      for (let channel = 0; channel < 4; channel++) assert.ok(Math.abs(fallback[0][channel] - results.dom.translucent[0][channel]) <= 2, "GPU loss preserves translucent DOM presentation");
      await page.keyboard.type("still usable");
      assert.equal(await page.evaluate(() => window.pixelFixture.inputs.join("")), "still usable");
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(JSON.stringify(results));
  for (const state of ["translucent", "lower", "opaque"]) {
    for (const sample of [0, 1, 2, 3, 6]) {
      for (let channel = 0; channel < 4; channel++) {
        assert.ok(Math.abs(results.dom[state][sample][channel] - results.webgl[state][sample][channel]) <= 3,
          `${state} sample ${sample}: GPU and DOM background pixels agree`);
      }
    }
  }
  console.log("PASS: GPU/DOM transparency, truecolor/ANSI/inverse backgrounds, opaque text/cursor/selection, stable mode switching, context restoration and context-loss fallback");
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
