import { describe, expect, it } from "vitest";
import type { HarnessSurface } from "@overcode/shared-protocol";
import { surfaceCookieDetails, topLevelSite } from "./surface-cookie.js";

const surface: HarnessSurface = {
  runtimeId: "deepseek-harness",
  displayName: "DeepSeek Harness",
  url: "http://localhost:3080/",
  cookie: { name: "dsh-auth-test", value: "signed", maxAgeSeconds: 60 },
};

describe("surface cookie partitioning", () => {
  it("creates a Secure partitioned cookie for the current website", () => {
    expect(surfaceCookieDetails(surface, "https://www.youtube.com/watch?v=1", 10_000)).toEqual({
      url: "https://localhost:3080/",
      name: "dsh-auth-test",
      value: "signed",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "no_restriction",
      expirationDate: 70,
      partitionKey: { topLevelSite: "https://www.youtube.com" },
    });
  });

  it("does not authorize non-web top-level pages", () => {
    expect(topLevelSite("chrome://extensions/")).toBeUndefined();
  });
});
