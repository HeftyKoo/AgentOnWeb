import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "@overcode/runtime-api";
import { DeepSeekHarnessRuntime } from "./index.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("DeepSeekHarnessRuntime ACP adapter", () => {
  it("treats resuming an already-active persisted session as idempotent", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "overcode-workspace-"));
    directories.push(workspace);
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "../tests/mock-acp-server.mjs");
    const runtime = new DeepSeekHarnessRuntime({ command: process.execPath, args: [fixture] });

    await runtime.connect({ endpoint: "stdio://mock" });
    const session = await runtime.createSession({
      workspace: { id: `local:${workspace}`, path: workspace, label: "fixture" },
    });

    await expect(runtime.resumeSession(session.id)).resolves.toMatchObject({
      id: session.id,
      status: "idle",
    });
    await runtime.disconnect();
  });

  it("normalizes a real ACP child process prompt, approval, tool, message, and completion", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "overcode-workspace-"));
    directories.push(workspace);
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "../tests/mock-acp-server.mjs");
    const runtime = new DeepSeekHarnessRuntime({ command: process.execPath, args: [fixture] });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.connect({ endpoint: "stdio://mock" });
    expect((await runtime.getCapabilities()).supported).toContain("approvals");
    const session = await runtime.createSession({
      workspace: { id: `local:${workspace}`, path: workspace, label: "fixture" },
    });
    await runtime.sendPrompt({ sessionId: session.id, prompt: "Run verification" });

    const approval = await waitFor(() => events.find((event) => event.type === "approval.requested"));
    if (approval.type !== "approval.requested") throw new Error("Expected approval event");
    await runtime.respondToApproval({
      sessionId: session.id,
      approvalId: approval.approval.id,
      choiceId: "allow-once",
    });
    await waitFor(() => events.find((event) => event.type === "agent.completed"));

    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.started",
      "approval.requested",
      "approval.resolved",
      "tool.started",
      "tool.completed",
      "message.delta",
      "agent.completed",
    ]));
    await runtime.disconnect();
  });
});

async function waitFor<T>(read: () => T | undefined, timeoutMs = 3_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for ACP event");
}
