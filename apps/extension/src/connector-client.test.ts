import { describe, expect, it } from "vitest";
import { isLocalSurfaceUrl, isNativeSurface, isRuntimeDescriptor } from "./connector-client.js";
import { isContentRequest } from "./shared.js";
describe("native surface trust", () => {
  it("requires an explicit surface contract and declared capabilities", () => {
    expect(isRuntimeDescriptor({ id: "example", displayName: "Example", surfaceKind: "web", capabilities: { translucency: false, optionTap: false } })).toBe(true);
    expect(isRuntimeDescriptor({ id: "example", displayName: "Example", surfaceKind: "web" })).toBe(false);
    expect(isRuntimeDescriptor({ id: "../bad", displayName: "Example", surfaceKind: "web", capabilities: { translucency: true, optionTap: true } })).toBe(false);
  });
  it("only accepts clean loopback HTTP surfaces", () => {
    expect(isLocalSurfaceUrl("http://localhost:3000/")).toBe(true);
    for (const url of ["https://example.org/", "http://localhost:3000/?token=secret", "http://user@localhost:3000/", "http://localhost:3000/other", "file:///tmp/test"]) expect(isLocalSurfaceUrl(url)).toBe(false);
    expect(isNativeSurface({ ok: true })).toBe(false);
    for (const value of [null, undefined, [], 42, "surface", { cookie: null }]) expect(isNativeSurface(value)).toBe(false);
  });
  it("validates privileged content messages and no longer accepts manual pairing", () => {
    expect(isContentRequest({ source: "overcode-content", type: "runtime.connect" })).toBe(true);
    for (const payload of [{ type: "bridge.pair" }, { type: "mode.set", mode: "evil" }, { type: "opacity.set", opacity: NaN }, { type: "runtime.connect", runtimeId: {} }]) expect(isContentRequest({ source: "overcode-content", ...payload })).toBe(false);
  });
});
