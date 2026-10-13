import { expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { AgentSessions } from "./agent-sessions.js";

const piBin = process.env.AOW_TEST_PI_BIN || "pi";
const available = spawnSync(piBin, ["--version"], { encoding: "utf8" }).status === 0;

it.skipIf(!available)("loads the installed extension in native Pi and observes tools, input, abort, error, new, resumed and forked sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-native-pi-"));
  const store = new AgentSessions();
  const events: any[] = [];
  let requests = 0;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    if (request.url === "/agent-event") {
      expect(request.headers.authorization).toBe("Bearer fixture-token");
      events.push(data);
      response.writeHead(store.ingest("native-terminal", data) ? 204 : 400).end();
      return;
    }
    requests++;
    const user = data.messages.filter((message: any) => message.role === "user").at(-1);
    const prompt = JSON.stringify(user?.content);
    if (prompt.includes("Provider error")) { response.writeHead(400).end('{"error":{"message":"Fixture failure"}}'); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    const send = (delta: object, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({
      id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture",
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`);
    send({ role: "assistant", content: "" });
    if (prompt.includes("Abort task")) return; // Keep streaming until Pi's native abort closes the request.
    if (data.messages.at(-1)?.role !== "tool") {
      send({ tool_calls: [{ index: 0, id: "fixture-tool", type: "function",
        function: { name: "read", arguments: JSON.stringify({ path: join(directory, "fixture.txt") }) } }] }, "tool_calls");
    } else send({ content: "Fixture complete" }, "stop");
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await writeFile(join(directory, "models.json"), JSON.stringify({ providers: { "aow-fixture": {
      api: "openai-completions", baseUrl: origin + "/v1", apiKey: "fixture",
      models: [{ id: "fixture", contextWindow: 8192, maxTokens: 128 }],
    } } }));
    await writeFile(join(directory, "settings.json"), '{"retry":{"enabled":false}}\n');
    await writeFile(join(directory, "fixture.txt"), "Private tool result\n");
    const command = join(directory, "confirm.ts");
    await writeFile(command, 'export default pi => { pi.registerCommand("aow-check", { description: "Local verification", handler: async (_args, ctx) => { await ctx.ui.confirm("Verify input", "Continue?"); } }); };\n');
    const env = { ...process.env, PI_CODING_AGENT_DIR: directory, PI_TELEMETRY: "0", AOW_AGENT_ENDPOINT: origin + "/agent-event", AOW_AGENT_TOKEN: "fixture-token" };
    const install = spawnSync(process.execPath, [resolve("packages/terminal-host/lib/cli.js"), "pi-extension", "install"], { env, encoding: "utf8" });
    expect(install.status, install.stderr).toBe(0);
    child = spawn(piBin, ["--mode", "rpc", "--offline", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve", "--provider", "aow-fixture", "--model", "fixture", "-e", command], { cwd: directory, env, stdio: ["pipe", "pipe", "pipe"] });
    const exited = once(child, "exit");
    let errors = "";
    child.stderr!.on("data", chunk => { errors += String(chunk); });
    const frames: any[] = [];
    createInterface({ input: child.stdout! }).on("line", line => { try { frames.push(JSON.parse(line)); } catch { /* Only RPC records matter. */ } });
    const send = (value: object) => child!.stdin!.write(JSON.stringify(value) + "\n");
    const current = () => store.snapshot().find(item => item.status !== "ended");
    await expect.poll(() => current()?.status, { timeout: 10000 }).toBe("idle");
    send({ id: "first", type: "prompt", message: "Read the fixture" });
    await expect.poll(() => current()?.status, { timeout: 10000 }).toBe("completed");
    expect(events.some(event => event.hook_event_name === "tool_execution_end")).toBe(true);
    expect(events.some(event => event.hook_event_name === "agent_settled")).toBe(true);
    const firstSession = current()!.id;
    send({ id: "state", type: "get_state" });
    await expect.poll(() => frames.some(frame => frame.id === "state" && frame.success)).toBe(true);
    const sessionPath = frames.find(frame => frame.id === "state").data.sessionFile;
    expect(sessionPath).toEqual(expect.any(String));
    send({ id: "input", type: "prompt", message: "/aow-check" });
    await expect.poll(() => current()?.status).toBe("approval");
    await expect.poll(() => frames.some(frame => frame.type === "extension_ui_request" && frame.method === "confirm")).toBe(true);
    const ui = frames.find(frame => frame.type === "extension_ui_request" && frame.method === "confirm");
    send({ type: "extension_ui_response", id: ui.id, confirmed: true });
    await expect.poll(() => current()?.status).toBe("idle");
    const calls = requests;
    send({ id: "abort-prompt", type: "prompt", message: "Abort task" });
    await expect.poll(() => requests > calls).toBe(true);
    send({ id: "abort", type: "abort" });
    await expect.poll(() => current()?.status).toBe("interrupted");
    send({ id: "error", type: "prompt", message: "Provider error" });
    await expect.poll(() => current()?.title).toBe("Provider error");
    await expect.poll(() => current()?.status).toBe("interrupted");
    send({ id: "new", type: "new_session" });
    await expect.poll(() => current()?.status).toBe("idle");
    expect(current()!.id).not.toBe(firstSession);
    expect(store.snapshot().find(item => item.id === firstSession)?.status).toBe("ended");
    send({ id: "resume", type: "switch_session", sessionPath });
    await expect.poll(() => current()?.id).toBe(firstSession);
    expect(current()?.status).toBe("idle");
    send({ id: "fork", type: "clone" });
    await expect.poll(() => frames.some(frame => frame.id === "fork" && frame.success)).toBe(true);
    await expect.poll(() => current()?.id !== firstSession).toBe(true);
    expect(current()?.status).toBe("idle");
    child.stdin!.end();
    expect((await exited)[0], errors).toBe(0);
    expect(store.snapshot().every(item => item.status === "ended")).toBe(true);
    expect(errors).toBe("");
    expect(JSON.stringify(events)).not.toContain("Private tool result");
    expect(JSON.stringify(events)).not.toContain("Fixture complete");
    expect(await readFile(join(directory, "settings.json"), "utf8")).toBe('{"retry":{"enabled":false}}\n');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
