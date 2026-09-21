import { expect, it } from "vitest";
import { OptionTapTracker } from "./option-tap.js";

const alt = {
  key: "Alt",
  repeat: false,
  isComposing: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};
it("recognizes a bare tap and clears it after release or lost focus", () => {
  const tracker = new OptionTapTracker();
  tracker.keydown(alt);
  expect(tracker.keyup(alt)).toBe(true);
  expect(tracker.keyup(alt)).toBe(false);
  tracker.keydown(alt);
  tracker.reset();
  expect(tracker.keyup(alt)).toBe(false);
});
it.each(["repeat", "isComposing", "ctrlKey", "metaKey", "shiftKey"])(
  "ignores Alt with %s on either press or release",
  (key) => {
    const tracker = new OptionTapTracker();
    tracker.keydown({ ...alt, [key]: true });
    expect(tracker.keyup(alt)).toBe(false);
    tracker.keydown(alt);
    expect(tracker.keyup({ ...alt, [key]: true })).toBe(false);
  },
);
it("does not turn an Alt shortcut into a tap", () => {
  const tracker = new OptionTapTracker();
  tracker.keydown(alt);
  tracker.keydown({ ...alt, key: "x" });
  expect(tracker.keyup(alt)).toBe(false);
});
