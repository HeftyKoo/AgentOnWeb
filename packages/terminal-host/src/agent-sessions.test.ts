import { expect, it, vi } from "vitest";
import { AgentSessions } from "./agent-sessions.js";
import { mergeCodexHooks, CODEX_EVENTS } from "./codex-hooks.js";

it("tracks separate terminals, approval attention, continuation, duplicate completion and stale turns", () => {
  const store = new AgentSessions();
  const changed = vi.fn(); const off = store.subscribe(changed);
  const event = (hook_event_name: string, data = {}) => store.ingest("terminal-a", { session_id: "codex-1", turn_id: "turn-1", hook_event_name, ...data });
  event("UserPromptSubmit", { prompt: "Fix login" });
  event("SessionStart", { source: "compact" });
  expect(store.snapshot()[0]!.status).toBe("running");
  event("PermissionRequest", { tool_name: "Bash", tool_input: { description: "Run integration tests" } });
  expect(store.snapshot()[0]).toMatchObject({ title: "Fix login", status: "approval", detail: "Run integration tests" });
  const approval = store.snapshot()[0]!.attentionId;
  event("PreToolUse", { tool_name: "Bash" });
  event("PostToolUse", { tool_name: "mcp__docs__search" });
  expect(store.snapshot()[0]!.status).toBe("approval");
  event("PostToolUse", { tool_name: "Bash" });
  expect(store.snapshot()[0]!.status).toBe("running");
  event("TurnComplete");
  const completed = store.snapshot()[0]!;
  expect(completed.status).toBe("completed");
  expect(completed.attentionId).not.toBe(approval);
  event("TurnComplete");
  expect(store.snapshot()[0]).toEqual(completed);
  expect(event("PostToolUse", { tool_name: "Bash" })).toBe(false);
  event("UserPromptSubmit", { turn_id: "turn-2", prompt: "Continue" });
  expect(event("TurnComplete")).toBe(false);
  expect(store.snapshot()[0]!.status).toBe("running");
  expect(store.ingest("terminal-b", { hook_event_name: "SessionStart", session_id: "codex-1" })).toBe(true);
  expect(store.snapshot()).toHaveLength(2);
  store.removeTerminal("terminal-a");
  expect(store.snapshot()).toHaveLength(1);
  off(); changed.mockClear();
  store.removeTerminal("terminal-b");
  expect(changed).not.toHaveBeenCalled();
});

it("rejects malformed hooks and subagent lifecycle events without changing the root session", () => {
  const store = new AgentSessions();
  for (const value of [null, [], "text", {}, { hook_event_name: "__proto__", session_id: "root" }, { hook_event_name: "Stop" }, { hook_event_name: "SubagentStop", session_id: "root" }, { hook_event_name: "Stop", session_id: "root", agent_id: "child" }])
    expect(store.ingest("a", value)).toBe(false);
  expect(store.snapshot()).toEqual([]);
});

it("merges integration hooks idempotently without removing existing commands or unrelated settings", () => {
  const original = { settings: { custom: true }, hooks: { Stop: [{ hooks: [{ type: "command", command: "my-check" }] }] } };
  const merged = mergeCodexHooks(original, "aow agent-event") as any;
  expect(merged.hooks.Stop[0]).toEqual(original.hooks.Stop[0]);
  expect(merged.settings).toEqual(original.settings);
  expect(original.hooks.Stop).toHaveLength(1);
  expect(mergeCodexHooks(merged, "aow agent-event")).toEqual(merged);
  for (const event of CODEX_EVENTS) expect(merged.hooks[event].at(-1).hooks[0]).toMatchObject({ timeout: 3, command: "aow agent-event" });
  expect(() => mergeCodexHooks({ hooks: { PermissionRequest: "bad" } }, "aow")).toThrow();
});

it('does not invent a second session from a notify thread absent from lifecycle hooks', () => {
  const store = new AgentSessions();
  store.ingest('same-terminal', { session_id: 'root', turn_id: 'root-turn', hook_event_name: 'UserPromptSubmit', prompt: 'Run sleep 12' });
  // Live Codex emitted an additional notify thread with no root lifecycle.
  store.ingest('same-terminal', { session_id: 'unobserved-thread', turn_id: 'other-turn', hook_event_name: 'TurnComplete' });
  expect(store.snapshot()).toHaveLength(1);
  expect(store.snapshot()[0]).toMatchObject({ status: 'running', title: 'Run sleep 12' });
  store.ingest('same-terminal', { session_id: 'root', turn_id: 'root-turn', hook_event_name: 'TurnComplete' });
  expect(store.snapshot()).toHaveLength(1);
  expect(store.snapshot()[0]).toMatchObject({ status: 'completed', title: 'Run sleep 12' });
});
