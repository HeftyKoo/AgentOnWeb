import { expect, it } from "vitest";
import { AgentSessions } from "./agent-sessions.js";

it("tracks Claude turns, approval, failure and completion alongside Codex in the same terminal", () => {
  const store = new AgentSessions();
  const event = (hook_event_name: string, data = {}) => store.ingest("a", { agent: "claude-code", session_id: "same", hook_event_name, ...data });
  const current = () => store.snapshot().find(item => item.agent === "Claude Code")!;
  event("SessionStart", { cwd: "/project" });
  expect(current()).toMatchObject({ status: "idle", title: "Claude Code session" });
  event("UserPromptSubmit", { prompt: "Claude task" });
  store.ingest("a", { session_id: "same", hook_event_name: "UserPromptSubmit", prompt: "Codex task" });
  expect(store.snapshot()).toHaveLength(2);
  event("PermissionRequest", { tool_name: "Bash", tool_input: { description: "Run a check" } });
  const attention = current().attentionId;
  event("Notification", { notification_type: "permission_prompt" });
  expect(current()).toMatchObject({ status: "approval", detail: "Run a check", attentionId: attention });
  event("PostToolUse", { tool_name: "Read" });
  expect(current().status).toBe("approval");
  event("PostToolUseFailure", { tool_name: "Bash", is_interrupt: false });
  expect(current().status).toBe("running");
  event("Stop", { last_assistant_message: "private response" });
  expect(current()).toMatchObject({ status: "completed", title: "Claude task", detail: "Turn complete" });
  const completedAttention = current().attentionId;
  event("Stop");
  event("Notification", { notification_type: "idle_prompt" });
  expect(current().attentionId).toBe(completedAttention);
  expect(current().status).toBe("completed");
  event("PreToolUse", { tool_name: "Read" });
  expect(current().status).toBe("running"); // A blocking Stop hook can continue the same turn.
  event("PostToolUseFailure", { is_interrupt: true });
  expect(current().status).toBe("interrupted");
  event("UserPromptSubmit", { prompt: "Next turn" });
  event("StopFailure");
  expect(current()).toMatchObject({ status: "interrupted", detail: "Turn stopped" });
  event("SessionEnd");
  expect(current().status).toBe("ended");
  store.removeTerminal("a");
  expect(store.snapshot()).toEqual([]);
});

it("handles notification-only permissions without poisoning later tool resolution", () => {
  const store = new AgentSessions();
  const event = (hook_event_name: string, data = {}) => store.ingest("a", { agent: "claude-code", session_id: "one", hook_event_name, ...data });
  expect(event("Stop")).toBe(false);
  event("Notification", { notification_type: "permission_prompt" });
  expect(store.snapshot()[0]?.status).toBe("approval");
  event("PostToolUse", { tool_name: "Bash" });
  expect(store.snapshot()[0]?.status).toBe("running");
  event("Notification", { notification_type: "idle_prompt" });
  expect(store.snapshot()[0]?.status).toBe("idle");
  expect(event("Notification", { notification_type: "auth_success" })).toBe(false);
  expect(event("SubagentStop", { agent_id: "child" })).toBe(false);
  expect(event("PreToolUse", { agent_id: "child" })).toBe(false);
  expect(event("TurnComplete")).toBe(false);
  expect(store.ingest("a", { agent: "unknown", session_id: "one", hook_event_name: "SessionStart" })).toBe(false);
});

it("ends and resumes a Claude session when lifecycle events carry a different prompt ID", () => {
  const store = new AgentSessions();
  const event = (hook_event_name: string, turn_id: string) => store.ingest("a", { agent: "claude-code", session_id: "one", hook_event_name, turn_id });
  event("UserPromptSubmit", "model-turn");
  event("Stop", "model-turn");
  // Native /exit assigns a new prompt_id without a UserPromptSubmit hook.
  expect(event("SessionEnd", "exit-command")).toBe(true);
  expect(store.snapshot()[0]?.status).toBe("ended");
  expect(event("Stop", "model-turn")).toBe(false);
  expect(store.snapshot()[0]?.status).toBe("ended");
  expect(event("SessionStart", "resume-command")).toBe(true);
  expect(store.snapshot()[0]?.status).toBe("idle");
  event("UserPromptSubmit", "new-turn");
  expect(event("Stop", "model-turn")).toBe(false);
  expect(store.snapshot()[0]?.status).toBe("running");
  expect(event("Stop", "new-turn")).toBe(true);
  expect(store.snapshot()[0]?.status).toBe("completed");
});

it("completes a continued Claude prompt without replaying duplicate Stop events", () => {
  const store = new AgentSessions();
  const event = (hook_event_name: string, extra = {}) => store.ingest("a", {
    agent: "claude-code", session_id: "one", turn_id: "continued-prompt", hook_event_name, ...extra,
  });
  const current = () => store.snapshot()[0]!;
  event("UserPromptSubmit");
  event("Stop");
  const firstAttention = current().attentionId;
  event("Stop");
  expect(current().attentionId).toBe(firstAttention);
  event("PreToolUse", { tool_name: "Read" });
  event("PostToolUse", { tool_name: "Read" });
  expect(current().status).toBe("running");
  event("Stop");
  expect(current().status).toBe("completed");
  const finalAttention = current().attentionId;
  expect(finalAttention).not.toBe(firstAttention);
  event("Stop");
  expect(current().attentionId).toBe(finalAttention);
  // A continued prompt can also be interrupted more than once.
  for (let attempt = 0; attempt < 2; attempt++) {
    event("PreToolUse", { tool_name: "Read" });
    event("PostToolUseFailure", { tool_name: "Read", is_interrupt: true });
    expect(current().status).toBe("interrupted");
  }
});
