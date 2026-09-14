import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { beforeAll, expect, it } from "vitest";
let code: string;
beforeAll(async () => {
  const result = await build({ entryPoints: [new URL("./demo.ts", import.meta.url).pathname], bundle: true, write: false,
    format: "iife", loader: { ".css": "text", ".svg": "text", ".png": "dataurl" } });
  code = result.outputFiles[0]!.text;
});
function demo() {
  const dom = new JSDOM('<div id="demo"></div>', { runScripts: "outside-only" });
  dom.window.eval(code);
  return dom;
}
it("opens populated content offline and preserves scratchpad edits across pages", () => {
  const dom = demo(); const doc = dom.window.document;
  expect(doc.querySelector(".agentonweb-root")?.getAttribute("data-mode")).toBe("focus");
  expect(doc.querySelector("#demo-content")?.textContent).toContain("pricing-card.html");
  (doc.querySelector('[data-page="scratchpad"]') as HTMLElement).click();
  const input = doc.querySelector("textarea")!; input.value = "My local note";
  input.dispatchEvent(new dom.window.Event("input"));
  (doc.querySelector('[data-page="test"]') as HTMLElement).click();
  expect(doc.querySelector("#demo-content")?.textContent).toContain("average([])");
  (doc.querySelector('[data-page="scratchpad"]') as HTMLElement).click();
  expect(doc.querySelector("textarea")!.value).toBe("My local note");
  dom.window.close();
});
it("switches actual presentation controls and leaves the website interactive in Watch", () => {
  const dom = demo(); const doc = dom.window.document;
  (doc.querySelector('[aria-label="Watch mode, shortcut Control Shift 3"]') as HTMLElement).click();
  expect(doc.querySelector(".agentonweb-root")?.getAttribute("data-mode")).toBe("watch");
  expect((doc.querySelector(".demo-workspace") as HTMLElement).inert).toBe(true);
  (doc.querySelector("#counter") as HTMLElement).click();
  expect(doc.querySelector("#counter")?.textContent).toBe("Website counter: 1");
  (doc.querySelector("#open-workspace") as HTMLElement).click();
  expect(doc.querySelector(".agentonweb-root")?.getAttribute("data-mode")).toBe("chill");
  dom.window.close();
});
