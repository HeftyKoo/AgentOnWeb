import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NativeViewState, parseSelection } from "./view-state.js";
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
describe("native DSH navigation bookmark", () => {
  it("retains only native selection across restart, including an explicitly empty view", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentonweb-native-view-")); directories.push(dir);
    const view = await NativeViewState.open(dir);
    expect(view.snapshot()).toEqual({ selection: null });
    await view.set({ sessionId: "native-session", transcript: "never persist this", credential: "never persist this" });
    expect((await NativeViewState.open(dir)).snapshot()).toEqual({ selection: { sessionId: "native-session" } });
    expect(await readFile(join(dir, "native-view.json"), "utf8")).not.toContain("never persist");
    expect((await stat(join(dir, "native-view.json"))).mode & 0o777).toBe(0o600);
    await view.set({}); expect((await NativeViewState.open(dir)).snapshot()).toEqual({ selection: {} });
  });
  it("bounds selection data and preserves valid native subagent addresses", () => {
    const value = { sessionId: "child", subagentAddress: { parentSessionId: "parent", childSessionId: "child", mode: "continuable" } };
    expect(parseSelection(value)).toEqual(value);
    for (const value of [null, [], "session", { sessionId: "" }, { sessionId: "x".repeat(257) }, { sessionId: "child", subagentAddress: { childSessionId: "other" } }]) {
      expect(() => parseSelection(value)).toThrow();
    }
  });
});
