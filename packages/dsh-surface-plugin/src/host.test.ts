import { describe, expect, it } from "vitest";
import { isAuthorizationRequest } from "./host.js";
describe("DSH native authorization CSRF guard", () => {
  it("uses the validated Host header instead of DSH's internal Fetch URL", () => {
    const request = (headers: Record<string, string>) => new Request("http://dsh.internal/api/agentonweb/connections", {
      method: "POST", headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080", "content-type": "application/json", ...headers },
    });
    expect(isAuthorizationRequest(request({}), 3080)).toBe(true);
    for (const headers of [{ origin: "https://example.org" }, { origin: "null" }, { host: "evil.test:3080" }, { "content-type": "text/plain" }, { origin: "http://127.0.0.1:3081" }]) expect(isAuthorizationRequest(request(headers), 3080)).toBe(false);
  });
});
