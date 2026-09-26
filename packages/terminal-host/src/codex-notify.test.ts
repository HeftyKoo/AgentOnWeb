import { expect, it } from "vitest";
import { parse } from "smol-toml";
import { configureNotify, removeNotify, completionEvent } from "./codex-notify.js";

it("restores the original notifier on uninstall and preserves later user replacements", () => {
  const source = '# Keep me\nnotify = ["python3", "/my script.py"]\nmodel = "mine"\n[projects]\n';
  const installed = configureNotify(source, "/node", "/cli");
  expect(parse(removeNotify(installed))).toEqual(parse(source));
  expect(removeNotify(installed)).toContain('model = "mine"\n[projects]\n');
  const absent = '# My model\nmodel = "mine"\n';
  expect(removeNotify(configureNotify(absent, "/node", "/cli"))).toBe(absent);
  expect(removeNotify(source)).toBe(source);
});

it("adds authoritative completion notifications without replacing user settings or comments", () => {
  const source = '# My settings\nmodel = "my-model"\n[projects."/work"]\ntrust_level = "trusted"\n';
  const result = configureNotify(source, "/node", "/aow cli.js");
  expect(result.endsWith(source)).toBe(true);
  expect(parse(result).notify).toEqual(["/node", "/aow cli.js", "agent-notify", "--forward", "[]"]);
  expect(configureNotify(result, "/node", "/aow cli.js")).toBe(result);
});

it("preserves and forwards an existing multiline notify command with shell-sensitive arguments", () => {
  const before = '# retained comment\nmodel = "my-model"\n';
  const after = '[project]\nnote = "notify is not an assignment"\n';
  const source = before + '"notify" = [\n  "python3", # my notifier\n  "/path with spaces/$file.py",\n]\n' + after;
  const result = configureNotify(source, "/new-node", "/new-cli");
  expect(result.startsWith(before)).toBe(true);
  expect(result.endsWith(after)).toBe(true);
  const command = parse(result).notify as string[];
  expect(JSON.parse(command[4]!)).toEqual(["python3", "/path with spaces/$file.py"]);
  expect(configureNotify(result, "/new-node", "/new-cli")).toBe(result);
  expect(() => configureNotify('notify = "invalid"', "/node", "/cli")).toThrow();
  expect(() => configureNotify('notify = [', "/node", "/cli")).toThrow();
});

it("only maps the official completion event, without copying assistant responses", () => {
  expect(completionEvent({ type: "agent-turn-complete", "thread-id": "one", "turn-id": "two", cwd: "/work", "last-assistant-message": "private" }))
    .toEqual({ hook_event_name: "TurnComplete", session_id: "one", turn_id: "two", cwd: "/work" });
  expect(completionEvent({ type: "Stop" })).toBeUndefined();
});
