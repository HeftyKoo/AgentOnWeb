import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURFACE_OPACITY,
  DoubleTapLatch,
  MAX_SURFACE_OPACITY,
  MIN_SURFACE_OPACITY,
  normalizeSurfaceOpacity,
} from "./interaction.js";

describe("DoubleTapLatch", () => {
  it("toggles only after two taps inside the double-tap window", () => {
    const latch = new DoubleTapLatch(360);

    expect(latch.tap(100)).toBeUndefined();
    expect(latch.tap(420)).toBe(true);
    expect(latch.tap(1_000)).toBeUndefined();
    expect(latch.tap(1_220)).toBe(false);
  });

  it("starts a new pair when the previous tap is too old", () => {
    const latch = new DoubleTapLatch(360);

    expect(latch.tap(100)).toBeUndefined();
    expect(latch.tap(500)).toBeUndefined();
    expect(latch.tap(700)).toBe(true);
  });

  it("clears pending taps and state when reset", () => {
    const latch = new DoubleTapLatch(360);

    latch.tap(100);
    latch.reset();
    expect(latch.tap(200)).toBeUndefined();
    expect(latch.tap(300)).toBe(true);
  });
});

describe("normalizeSurfaceOpacity", () => {
  it("defaults invalid values and clamps valid values", () => {
    expect(normalizeSurfaceOpacity(undefined)).toBe(DEFAULT_SURFACE_OPACITY);
    expect(normalizeSurfaceOpacity(Number.NaN)).toBe(DEFAULT_SURFACE_OPACITY);
    expect(normalizeSurfaceOpacity(0.05)).toBe(MIN_SURFACE_OPACITY);
    expect(normalizeSurfaceOpacity(0.72)).toBe(0.72);
    expect(normalizeSurfaceOpacity(1)).toBe(MAX_SURFACE_OPACITY);
  });
});
