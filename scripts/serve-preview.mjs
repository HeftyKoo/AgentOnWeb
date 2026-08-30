import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../apps/extension/preview");
const port = Number.parseInt(process.env.OVERCODE_PREVIEW_PORT ?? "4173", 10);
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  if (requested.includes("..") || requested.includes("\\")) {
    response.writeHead(400).end("Bad request");
    return;
  }
  try {
    const body = await readFile(resolve(root, requested));
    response.writeHead(200, { "Content-Type": contentTypes.get(extname(requested)) ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Overcode preview: http://127.0.0.1:${port}`);
});
