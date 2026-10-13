import { expect, it } from "vitest";
import { AgentSessions } from "./agent-sessions.js";

it("isolates Pi from other agents and rejects stale, late and non-native completion events", () => {
  const store = new AgentSessions();
  const emit = (hook_event_name: string, fields = {}) => store.ingest("terminal", {
    agent: "pi", session_id: "same", hook_event_name, ...fields,
  });
  const current = () => store.snapshot().find(item => item.agent === "Pi")!;
  expect(emit("agent_settled")).toBe(false);
  for (const agent of ["codex", "claude-code", "pi"]) store.ingest("terminal", {
    agent, session_id: "same", hook_event_name: agent === "pi" ? "session_start" : "SessionStart",
  });
  expect(store.snapshot()).toHaveLength(3);
  emit("before_agent_start", { turn_id: "old", prompt: "First task" });
  emit("agent_settled", { turn_id: "old" });
  const attention = current().attentionId;
  emit("before_agent_start", { turn_id: "new", prompt: "Second task" });
  expect(emit("agent_settled", { turn_id: "old" })).toBe(false);
  expect(current().status).toBe("running");
  for (const name of ["Stop", "TurnComplete", "agent_end", "__proto__", "constructor"]) expect(emit(name)).toBe(false);
  emit("agent_settled", { turn_id: "new" });
  expect(current().attentionId).not.toBe(attention);
  emit("session_shutdown", { turn_id: "new" });
  expect(emit("agent_settled", { turn_id: "new" })).toBe(false);
  emit("session_start");
  expect(current().status).toBe("idle");
  store.removeTerminal("terminal");
  expect(store.snapshot()).toEqual([]);
});
