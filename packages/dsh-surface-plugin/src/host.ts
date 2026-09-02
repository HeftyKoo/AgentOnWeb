import { homedir } from "node:os";
import { join } from "node:path";
import { Authorization, startConnector } from "@overcode/connector-host";
import type { NativeSurface, SurfaceAdapter } from "@overcode/connector-contract";
import { NativeViewState } from "./view-state.js";

export const inject = ["webServer", "connection"];

interface DshContext {
  webServer: { host: string; port: number };
  connection: {
    authenticatedUrl(base: string): string;
    fetch: { register(route: { path: string; methods: string[]; fetch: (request: Request) => Promise<Response> }): unknown };
  };
  effect(setup: () => (() => Promise<void>), label: string): unknown;
}

/** Uses DSH's existing Web process and auth contract; never spawns another agent. */
export async function apply(ctx: DshContext): Promise<void> {
  if (ctx.webServer.host !== "127.0.0.1") throw new Error("Overcode requires DSH's loopback-only Web server.");
  const authority = await Authorization.open(join(homedir(), ".config", "overcode", "deepseek-harness"));
  const nativeView = await NativeViewState.open(authority.directory);
  const adapter: SurfaceAdapter = {
    runtime: { id: "deepseek-harness", displayName: "DeepSeek Harness", surfaceKind: "web", capabilities: { translucency: true, optionTap: true } },
    approvalUrl: `http://127.0.0.1:${ctx.webServer.port}/`,
    async getSurface(): Promise<NativeSurface> {
      // localhost is a trustworthy browser origin for delegated native sessions.
      // The launch token and signed cookie never pass through page JavaScript.
      const base = `http://localhost:${ctx.webServer.port}/`;
      const response = await fetch(ctx.connection.authenticatedUrl(base), { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      const cookie = response.headers.get("set-cookie");
      const match = cookie?.match(/^([^=;]+)=([^;]+);/u);
      const age = cookie?.match(/Max-Age=(\d+)/iu);
      if (response.status !== 303 || !match?.[1] || !match[2] || !age?.[1]) throw new Error("DSH did not issue a native browser session.");
      return { runtimeId: adapter.runtime.id, displayName: adapter.runtime.displayName, url: base,
        cookie: { name: match[1], value: match[2], maxAgeSeconds: Number(age[1]) } };
    },
  };
  const connector = await startConnector(adapter, authority);
  ctx.effect(() => () => connector.close(), "overcode: runtime connector lifecycle");

  // Browsers partition iframe storage by website. Keep only DSH's native view
  // selection here so a different website can restore that view through DSH.
  // This route stays inside native authentication; no bookmark enters Overcode's protocol.
  ctx.connection.fetch.register({
    path: "/api/overcode/native-view", methods: ["GET", "POST"],
    async fetch(request) {
      const headers = { "cache-control": "no-store" };
      if (request.method === "GET") return Response.json(nativeView.snapshot(), { headers });
      if (!isAuthorizationRequest(request, ctx.webServer.port)) return Response.json({ error: "Untrusted view request." }, { status: 403, headers });
      try { await nativeView.set(await request.json()); return Response.json(nativeView.snapshot(), { headers }); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid view." }, { status: 400, headers }); }
    },
  });

  // Registered below /api, so DSH enforces its native auth AND Host/Origin fence.
  // JSON + exact same-origin POST adds a CSRF guard; no CORS permission is granted.
  ctx.connection.fetch.register({
    path: "/api/overcode/connections",
    methods: ["GET", "POST"],
    async fetch(request) {
      const headers = { "cache-control": "no-store" };
      if (request.method === "GET") return Response.json(authority.snapshot(), { headers });
      if (!isAuthorizationRequest(request, ctx.webServer.port)) {
        return Response.json({ error: "Untrusted authorization request." }, { status: 403, headers });
      }
      try {
        const body: unknown = await request.json();
        if (!body || typeof body !== "object") throw new Error("Invalid request.");
        const { action, id } = body as { action?: unknown; id?: unknown };
        if (typeof id !== "string" || id.length > 64) throw new Error("Invalid request id.");
        if (action === "allow" || action === "deny") await authority.decide(id, action === "allow");
        else if (action === "revoke") await authority.revoke(id);
        else throw new Error("Invalid connection action.");
        return Response.json(authority.snapshot(), { headers });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Authorization failed." }, { status: 400, headers });
      }
    },
  });
}

export function isAuthorizationRequest(request: Request, port: number): boolean {
  // DSH's Fetch bridge intentionally uses http://dsh.internal as request.url.
  // Trust the already-validated Host header, not that transport placeholder.
  const host = request.headers.get("host");
  return (host === `127.0.0.1:${port}` || host === `localhost:${port}`)
    && request.headers.get("origin") === `http://${host}`
    && request.headers.get("content-type")?.split(";")[0] === "application/json";
}
