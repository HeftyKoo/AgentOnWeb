import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPSHOT, nextMode, reduceAgentEvent } from "./index.js";

describe("Overcode core state", () => {
  it("cycles Chill, Focus, and Watch without touching session state", () => {
    expect(nextMode("chill")).toBe("focus");
    expect(nextMode("focus")).toBe("watch");
    expect(nextMode("watch")).toBe("chill");
  });

  it("keeps approval visible until the matching decision resolves", () => {
    const requested = reduceAgentEvent(DEFAULT_SNAPSHOT, {
      type: "approval.requested",
      sessionId: "session-1",
      occurredAt: "2026-08-29T00:00:00.000Z",
      approval: {
        id: "approval-1",
        sessionId: "session-1",
        title: "Run tests",
        choices: [
          { id: "allow-once", label: "Allow once", kind: "approve" },
          { id: "reject-once", label: "Reject", kind: "deny" },
        ],
      },
    });
    expect(requested.status).toBe("needs-approval");
    expect(requested.pendingApproval?.id).toBe("approval-1");

    const unrelated = reduceAgentEvent(requested, {
      type: "approval.resolved",
      sessionId: "session-1",
      occurredAt: "2026-08-29T00:00:01.000Z",
      approvalId: "approval-other",
      choiceId: "reject-once",
    });
    expect(unrelated.pendingApproval?.id).toBe("approval-1");

    const resolved = reduceAgentEvent(unrelated, {
      type: "approval.resolved",
      sessionId: "session-1",
      occurredAt: "2026-08-29T00:00:02.000Z",
      approvalId: "approval-1",
      choiceId: "allow-once",
    });
    expect(resolved.pendingApproval).toBeUndefined();
    expect(resolved.status).toBe("working");
  });
});
