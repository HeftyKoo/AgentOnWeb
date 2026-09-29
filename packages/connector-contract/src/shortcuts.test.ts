import { describe, expect, it } from "vitest";
import { isSurfaceShortcut, surfaceShortcut } from "./shortcuts.js";
describe("surface shortcuts", () => {
  const event = { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false, isComposing: false, code: "Backquote" };
  it("toggles runtimes with physical Control+Backquote and maps the three modes", () => {
    expect(surfaceShortcut(event, true)).toBe("runtime.toggle");
    const windows = { ...event, ctrlKey: false, altKey: true };
    expect(surfaceShortcut(windows, false)).toBe("runtime.toggle");
    expect(surfaceShortcut({ ...windows, code: "Digit2" }, false)).toBe("focus");
    expect(surfaceShortcut(event, false)).toBeUndefined();
    expect(surfaceShortcut(windows, true)).toBeUndefined();
    for (const [code, action] of [["Digit1", "chill"], ["Digit2", "focus"], ["Digit3", "watch"]]) {
      expect(surfaceShortcut({ ...event, code: code! }, true)).toBe(action);
    }
  });
  it("rejects old shortcuts, extra modifiers, composition and invalid forwarded actions", () => {
    for (const overrides of [{ altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { ctrlKey: false }, { code: "KeyD" }, { code: "KeyT" }, { code: "Digit4" }, { code: "Digit5" }]) {
      expect(surfaceShortcut({ ...event, ...overrides }, true)).toBeUndefined();
    }
    expect(isSurfaceShortcut("runtime.toggle")).toBe(true);
    for (const action of [4, 5, "runtime.activate", {}, null]) expect(isSurfaceShortcut(action)).toBe(false);
  });
});
