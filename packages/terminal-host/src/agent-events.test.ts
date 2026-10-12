import { afterEach, expect, it, vi } from "vitest";
import { reportAgentInput } from "./agent-events.js";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("reports only bounded presentation fields and correlates Claude's official prompt ID", async () => {
  vi.stubEnv("AOW_AGENT_ENDPOINT", "http://127.0.0.1:1234/agent-event");
  vi.stubEnv("AOW_AGENT_TOKEN", "test-terminal-token");
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  await reportAgentInput({ session_id: "one", prompt_id: "prompt-one", hook_event_name: "PostToolUseFailure", prompt: "p".repeat(200),
    tool_input: { command: "private command", description: "d".repeat(600) }, tool_response: "private output", transcript_path: "/private/transcript", last_assistant_message: "private response", is_interrupt: true }, "claude-code");
  const options = fetch.mock.calls[0]![1];
  expect(options.headers.authorization).toBe("Bearer test-terminal-token");
  expect(options.redirect).toBe("error");
  expect(JSON.parse(options.body)).toEqual({ agent: "claude-code", session_id: "one", hook_event_name: "PostToolUseFailure", turn_id: "prompt-one",
    prompt: "p".repeat(160), tool_input: { description: "d".repeat(500) }, is_interrupt: true });
});

it("does nothing without a terminal token or for a non-loopback event URL", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  vi.stubEnv("AOW_AGENT_TOKEN", "");
  await reportAgentInput({});
  vi.stubEnv("AOW_AGENT_TOKEN", "test");
  for (const url of ["https://127.0.0.1/agent-event", "http://example.com/agent-event", "http://127.0.0.1/elsewhere"]) {
    vi.stubEnv("AOW_AGENT_ENDPOINT", url);
    await reportAgentInput({}, "claude-code");
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("reports a complete hook JSON without waiting for the CLI to close stdin", async () => {
  let received: any;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    response.writeHead(204).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const child = spawn(process.execPath, [resolve("packages/terminal-host/lib/agent-hook.js"), "claude-code"], {
    env: { ...process.env, AOW_AGENT_ENDPOINT: `http://127.0.0.1:${address.port}/agent-event`, AOW_AGENT_TOKEN: "test-token" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = ""; let errors = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { errors += chunk; });
  try {
    const exited = once(child, "exit");
    const body = Buffer.from(JSON.stringify({ session_id: "native", hook_event_name: "UserPromptSubmit", prompt_id: "turn", prompt: "中文通知" }));
    const split = body.indexOf(Buffer.from("中")) + 1;
    child.stdin.write(body.subarray(0, split));
    await new Promise(resolve => setTimeout(resolve, 50));
    child.stdin.write(body.subarray(split)); // Intentionally leave the pipe open.
    expect((await exited)[0]).toBe(0);
    expect(received).toMatchObject({ agent: "claude-code", session_id: "native", turn_id: "turn", prompt: "中文通知" });
    expect(output).toBe(""); expect(errors).toBe("");
  } finally {
    child.kill();
    server.closeAllConnections(); server.close();
  }
}, 10000);
