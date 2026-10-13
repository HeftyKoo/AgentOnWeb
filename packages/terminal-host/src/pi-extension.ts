import { randomUUID } from "node:crypto";
import { reportAgentInput } from "./agent-events.js";

// Only the observational subset is needed; loading this extension requires no Pi dependency.
interface PiContext {
  cwd: string;
  sessionManager: { getSessionId(): string };
  isIdle(): boolean;
}
interface PiEvent {
  prompt?: string;
  toolName?: string;
  toolCallId?: string;
  title?: string;
  outcome?: string;
  aborted?: boolean;
}
interface PiAPI {
  on(event: string, handler: (event: PiEvent, context: PiContext) => Promise<void>): unknown;
}

export default function piExtension(pi: PiAPI): void {
  if (!process.env.AOW_AGENT_ENDPOINT || !process.env.AOW_AGENT_TOKEN) return;
  let turn = "";
  let outcome = "completed";
  let queue = Promise.resolve();
  const report = (event: string, ctx: PiContext, fields: object = {}) => {
    const input = { session_id: ctx.sessionManager.getSessionId(), hook_event_name: event,
      turn_id: turn, cwd: ctx.cwd, ...fields };
    // UI prompt events can overlap tool events. Keep the authenticated ingress ordered.
    queue = queue.then(() => reportAgentInput(input, "pi")).catch(() => {});
    return queue;
  };
  pi.on("session_start", async (_event, ctx) => {
    turn = "";
    await report("session_start", ctx);
  });
  pi.on("before_agent_start", async (event, ctx) => {
    turn = randomUUID();
    await report("before_agent_start", ctx, { prompt: event.prompt });
  });
  pi.on("agent_start", async (_event, ctx) => {
    outcome = "completed";
    await report("agent_start", ctx);
  });
  for (const name of ["tool_execution_start", "tool_execution_end"]) {
    pi.on(name, async (event, ctx) => {
      await report(name, ctx, { tool_name: event.toolName, tool_use_id: event.toolCallId });
    });
  }
  pi.on("ui_prompt_start", async (event, ctx) => {
    await report("ui_prompt_start", ctx, { tool_name: "user-input", tool_input: { description: event.title } });
  });
  pi.on("ui_prompt_end", async (_event, ctx) => {
    await report("ui_prompt_end", ctx, { tool_name: "user-input", is_idle: ctx.isIdle() });
  });
  pi.on("turn_end", async (event) => { outcome = event.outcome ?? "completed"; });
  // agent_end can be followed by retries, compaction or queued work in Pi 1.1+.
  pi.on("agent_settled", async (event, ctx) => {
    await report("agent_settled", ctx, { is_interrupt: event.aborted === true || outcome !== "completed" });
  });
  pi.on("session_shutdown", async (_event, ctx) => { await report("session_shutdown", ctx); });
}
