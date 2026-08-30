import readline from "node:readline";

const input = readline.createInterface({ input: process.stdin });
const session = {
  sessionId: "dsh-session-1",
  cwd: process.cwd(),
  title: "Mock Harness Session",
  updatedAt: new Date().toISOString(),
};
let pendingPrompt;
let active = false;

const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: 1,
        agentInfo: { name: "mock-dsh", version: "0.1.2-alpha.1" },
        agentCapabilities: {
          sessionCapabilities: { list: {}, resume: {}, close: {} },
          promptCapabilities: {},
        },
        authMethods: [],
      },
    });
    return;
  }
  if (message.method === "session/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessions: [session] } });
    return;
  }
  if (message.method === "session/new") {
    session.cwd = message.params.cwd;
    active = true;
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: session.sessionId, configOptions: [] } });
    return;
  }
  if (message.method === "session/resume") {
    if (active) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32602, message: `Invalid params: session is already active: ${session.sessionId}` },
      });
      return;
    }
    active = true;
    send({ jsonrpc: "2.0", id: message.id, result: { configOptions: [] } });
    return;
  }
  if (message.method === "session/prompt") {
    pendingPrompt = message.id;
    send({
      jsonrpc: "2.0",
      id: "permission-1",
      method: "session/request_permission",
      params: {
        sessionId: session.sessionId,
        toolCall: { toolCallId: "tool-1", title: "Run verification", kind: "execute", rawInput: { command: "pnpm test" } },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" },
        ],
      },
    });
    return;
  }
  if (message.id === "permission-1" && pendingPrompt) {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: session.sessionId, update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Run verification", kind: "execute", status: "in_progress", rawInput: { command: "pnpm test" } } },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: session.sessionId, update: { sessionUpdate: "tool_call_update", toolCallId: "tool-1", title: "Run verification", status: "completed" } },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: session.sessionId, update: { sessionUpdate: "agent_message_chunk", messageId: "message-1", content: { type: "text", text: "Verification passed." } } },
    });
    send({ jsonrpc: "2.0", id: pendingPrompt, result: { stopReason: "end_turn" } });
    pendingPrompt = undefined;
    return;
  }
});
