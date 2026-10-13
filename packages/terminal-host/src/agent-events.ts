/** Observational hook: no stdout, permission decision, or effect outside AOW terminals. */
export async function reportAgentEvent(agent: "codex" | "claude-code" | "pi" = "codex"): Promise<void> {
  if (!process.env.AOW_AGENT_ENDPOINT || !process.env.AOW_AGENT_TOKEN) return;
  process.stdin.setEncoding("utf8");
  let body = "";
  for await (const chunk of process.stdin) {
    body += chunk;
    if (body.length > 4_194_304) return;
    let input: unknown;
    try { input = JSON.parse(body); } catch { continue; }
    // Each invocation contains one JSON input. A CLI may keep its pipe open;
    // waiting for EOF after receiving that input can exhaust its hook timeout.
    await reportAgentInput(input, agent);
    return;
  }
}
export async function reportAgentInput(input: any, agent: "codex" | "claude-code" | "pi" = "codex"): Promise<void> {
  const endpoint = process.env.AOW_AGENT_ENDPOINT;
  const token = process.env.AOW_AGENT_TOKEN;
  if (!endpoint || !token) return;
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/agent-event") return;
  // Do not forward commands, tool output, or assistant responses to presentation.
  const payload = { agent, session_id: input.session_id, hook_event_name: input.hook_event_name, turn_id: agent === "claude-code" ? input.prompt_id : input.turn_id,
    agent_id: input.agent_id, notification_type: input.notification_type, is_interrupt: input.is_interrupt, is_idle: agent === "pi" ? input.is_idle : undefined, source: input.source, cwd: input.cwd, prompt: typeof input.prompt === "string" ? input.prompt.slice(0, 160) : undefined,
    tool_name: input.tool_name, tool_use_id: input.tool_use_id,
    tool_input: { description: typeof input.tool_input?.description === "string" ? input.tool_input.description.slice(0, 500) : undefined } };
  await fetch(url, { method: "POST", redirect: "error", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(1200) });
}
