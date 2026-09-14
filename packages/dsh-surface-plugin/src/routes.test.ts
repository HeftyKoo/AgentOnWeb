import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { apply } from "./host.js";

vi.mock("@agentonweb/connector-host", () => ({
  Authorization: { open: async () => ({ directory: "/unused", snapshot: () => ({ pending: [], grants: [] }), decide: vi.fn() }) },
  startConnector: async () => ({ close: vi.fn() }),
}));
vi.mock("./view-state.js", () => ({
  NativeViewState: { open: async () => ({ snapshot: () => ({ selection: null }), set: vi.fn() }) },
}));

type Route = Parameters<Parameters<typeof apply>[0]["connection"]["fetch"]["register"]>[0];
async function registeredRoutes() {
  const routes: Route[] = [];
  await apply({
    webServer: { host: "127.0.0.1", port: 3080 },
    connection: { authenticatedUrl: (url) => url, fetch: { register: (route) => routes.push(route) } },
    effect: () => undefined,
  });
  return routes;
}

it("registers both native JSON routes with buffered request bodies", async () => {
  const routes = await registeredRoutes();
  expect(routes.map((route) => route.path)).toEqual(["/api/agentonweb/native-view", "/api/agentonweb/connections"]);
  for (const route of routes) expect(route).toMatchObject({ methods: ["GET", "POST"], requestBody: "buffered" });
});

// Opt in with an installed DSH module to exercise its real HTTP bridge without booting a user session.
const connectionModule = process.env.DSH_CONNECTION_MODULE;
describe.skipIf(!connectionModule)("installed DSH HTTP bridge", () => {
  it("dispatches empty GET and JSON POST requests through both registered routes", async () => {
    const source = readFileSync(connectionModule!, "utf8");
    const start = source.indexOf("async function bridge(");
    expect(start).toBeGreaterThanOrEqual(0);
    const bridge = runInNewContext(`(${source.slice(start, source.indexOf("\n//#endregion", start))})`, {
      Readable, Request, URL, AbortController, Buffer, DEFAULT_MAX_REQUEST_BODY_BYTES: 300 * 1024 * 1024,
    });
    for (const route of await registeredRoutes()) {
      for (const method of route.methods) {
        const body = route.path.endsWith("connections") ? { action: "deny", id: "test-request" } : { selection: null };
        const req = Object.assign(Readable.from(method === "POST" ? [Buffer.from(JSON.stringify(body))] : []), {
          url: route.path, method,
          headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080", "content-type": "application/json" },
        });
        const res = Object.assign(new EventEmitter(), {
          writableEnded: false, writeHead: vi.fn(), write: vi.fn(() => true),
          end() { this.writableEnded = true; },
        });
        await bridge(req, res, { requestBodyMode: () => route.requestBody, fetch: route.fetch });
        expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ "cache-control": "no-store" }));
        expect(res.writableEnded).toBe(true);
      }
    }
  });
});
