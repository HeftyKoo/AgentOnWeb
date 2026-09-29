import { expect, it } from "vitest";
import { nextRuntimeId } from "./runtime-navigation.js";
it("cycles the displayed runtimes without privileging a particular runtime id", () => {
  const runtimes = [{ id: "terminal" }, { id: "third-runtime" }, { id: "deepseek-harness" }];
  expect(nextRuntimeId(runtimes, "terminal")).toBe("third-runtime");
  expect(nextRuntimeId(runtimes, "third-runtime")).toBe("deepseek-harness");
  expect(nextRuntimeId(runtimes, "deepseek-harness")).toBe("terminal");
  expect(nextRuntimeId(runtimes, "removed")).toBe("terminal");
  expect(nextRuntimeId(runtimes.slice(0, 1), "terminal")).toBeUndefined();
  expect(nextRuntimeId([], "terminal")).toBeUndefined();
});
