import { afterEach, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { installRenderer } from "./renderer.js";

const addons = vi.hoisted(() => [] as { dispose: ReturnType<typeof vi.fn>; loss?: () => void }[]);
const bridge = vi.hoisted(() => ({ setOpacity: vi.fn() }));
vi.mock("./webgl-backgrounds.js", () => ({ installWebglBackgroundOpacity: () => bridge.setOpacity }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: class {
  dispose = vi.fn();
  loss?: () => void;
  constructor() { addons.push(this); }
  onContextLoss(callback: () => void) { this.loss = callback; }
} }));
afterEach(() => { addons.length = 0; bridge.setOpacity.mockClear(); vi.unstubAllGlobals(); });

it("keeps the GPU renderer across modes and preserves opacity after context loss", () => {
  vi.stubGlobal("WebGL2RenderingContext", class {});
  const loadAddon = vi.fn();
  const fallback = vi.fn();
  const setOpacity = installRenderer({ loadAddon } as unknown as Terminal, fallback);
  setOpacity(1); setOpacity(1);
  expect(loadAddon).toHaveBeenCalledTimes(1);
  setOpacity(0.4); setOpacity(0.2);
  expect(addons[0]!.dispose).not.toHaveBeenCalled();
  expect(bridge.setOpacity).toHaveBeenLastCalledWith(0.2);
  addons[0]!.loss!();
  expect(addons[0]!.dispose).toHaveBeenCalledTimes(1);
  expect(fallback).toHaveBeenLastCalledWith(0.2);
  setOpacity(1);
  expect(fallback).toHaveBeenLastCalledWith(1);
  expect(loadAddon).toHaveBeenCalledTimes(1);
});

it("falls back without repeated initialization when WebGL is unavailable", () => {
  vi.stubGlobal("WebGL2RenderingContext", class {});
  const loadAddon = vi.fn(() => { throw new Error("Context unavailable"); });
  const fallback = vi.fn();
  const setOpacity = installRenderer({ loadAddon } as unknown as Terminal, fallback);
  expect(() => { setOpacity(1); setOpacity(0.4); setOpacity(1); }).not.toThrow();
  expect(loadAddon).toHaveBeenCalledTimes(1);
  expect(addons[0]!.dispose).toHaveBeenCalledTimes(1);
});
