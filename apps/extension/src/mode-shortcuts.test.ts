import { describe, expect, it } from "vitest";
import { commandMode, hasDefaultModeShortcut } from "./mode-shortcuts.js";

describe("mode shortcut bindings", () => {
  it.each(["Ctrl+1", "Control+1", "MacCtrl+1", "⌃1"])("recognizes macOS Control display string %s", shortcut => {
    expect(hasDefaultModeShortcut([{ name: "mode-chill", shortcut }], "chill", true)).toBe(true);
  });

  it("does not revive cleared commands, remaps, other modes or Command keys", () => {
    for (const shortcut of [undefined, "", "Command+1", "⌘1", "Ctrl+Shift+1", "Alt+1", "Ctrl+2"]) {
      expect(hasDefaultModeShortcut([{ name: "mode-chill", ...(shortcut === undefined ? {} : { shortcut }) }], "chill", true)).toBe(false);
    }
    expect(hasDefaultModeShortcut([{ name: "mode-focus", shortcut: "Ctrl+1" }], "chill", true)).toBe(false);
    expect(commandMode("_execute_action")).toBeUndefined();
  });

  it("uses Alt mode keys on Windows/Linux", () => {
    expect(hasDefaultModeShortcut([{ name: "mode-watch", shortcut: "Alt+3" }], "watch", false)).toBe(true);
    expect(hasDefaultModeShortcut([{ name: "mode-watch", shortcut: "Ctrl+3" }], "watch", false)).toBe(false);
  });
});
