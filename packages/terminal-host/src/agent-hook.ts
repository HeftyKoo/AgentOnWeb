#!/usr/bin/env node
import { reportAgentEvent } from "./agent-events.js";

// Hook startup must not load PTY, terminal emulation or service dependencies.
if (process.argv.length === 3 && (process.argv[2] === "codex" || process.argv[2] === "claude-code" || process.argv[2] === "pi"))
  await reportAgentEvent(process.argv[2]).catch(() => {});
process.exit(0);
