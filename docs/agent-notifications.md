# Agent sessions and page notifications

The page launcher shows Codex and Claude Code sessions across local terminals. Running sessions have a count badge; sessions requiring approval appear first with an amber status. Completion and permission requests produce a dismissible page notification. Selecting a row or notification opens that exact terminal, including when its surface has not loaded yet or another runtime is selected. Approval decisions remain in the native CLI TUI.

## Enable Codex events

The [one-command installer](one-command-setup.md) sets up Codex events automatically. To repair them, run:

```sh
aow codex-hooks install
```

The installer backs up and updates `hooks.json` and `config.toml` in `CODEX_HOME` (default `~/.codex`). Existing hook groups and unrelated TOML formatting/comments remain intact. If a `notify` command already exists, the new completion reporter forwards every original payload to it using its original argument array, without a shell. Running the installer again updates the integration without nesting forwarders. Re-run it if the installed Node or CLI path changes.

If `config.toml` cannot be safely parsed, the installer warns and keeps it unchanged; hooks still install. Fix the file and rerun installation to enable completion notifications. `aow codex-hooks uninstall` removes the integration and restores the previous notify command without overwriting later user settings.

Open `/hooks` in Codex, review and trust the **AgentOnWeb session status** hooks, and start a new Codex session inside a terminal created by the updated host. Existing shells started by an older host do not have the event environment. Hooks are observational: they never approve, deny, or rewrite a command. Outside AgentOnWeb terminals they do nothing, and the existing `notify` command continues to run.

A project or profile that overrides `notify`, disabled/untrusted hooks, or launching Codex through a process that drops the inherited environment can prevent events. Install into the `CODEX_HOME` used by that Codex process. Hook failures are deliberately fail-open for the CLI: they do not interrupt coding.

## Enable Claude Code events

`aow setup` installs Claude Code events too. To repair or remove only them, use `aow claude-hooks install` or `aow claude-hooks uninstall`. Configuration lives in `CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`); existing settings and hook commands are preserved, writes are backed up, and repeat installation is idempotent. Review **AgentOnWeb session status** in Claude Code `/hooks` and start a new session in an updated host terminal. The installed command uses the packaged lightweight `agent-hook.js claude-code` reporter and the same authenticated per-terminal ingress; `aow agent-event claude-code` remains available for manual diagnostics. Claude Code invokes Node with an argument array, avoiding shell startup and shell quoting. The reporter sends one complete JSON input without waiting for stdin to close and decodes streamed UTF-8 safely. The hook process avoids loading terminal/PTY dependencies and has a five-second hook timeout with a 1.2-second network deadline.

`SessionStart`, `UserPromptSubmit`, tool events and `PermissionRequest` produce the same public states as Codex. `Notification: permission_prompt` supplies a fallback approval signal without double-counting the permission request. Successful or failed matching tool calls clear approval. `Stop` reports completion; `StopFailure` and an interrupt-marked `PostToolUseFailure` report a stopped turn. `SessionEnd` hides the session. `Notification: idle_prompt` clears an otherwise running indicator without producing a completion notification or replacing a known approval/completion. `prompt_id`, when supplied by Claude Code, correlates turns and rejects late events. Session start/end remain session-scoped: native commands such as `/exit` can assign a new prompt ID without a prompt-submitted hook. Agent-specific session IDs keep Codex and Claude Code independent even in the same terminal. Subagent events are ignored.

Claude Code has no universal user-interrupt hook. An interruption or permission denial that emits no supported event can leave the displayed status approximate until the next prompt or session end; an idle notification clears an otherwise running indicator. A separate Stop hook can continue the turn after our observational hook reports completion; subsequent activity restores Working. The native TUI is authoritative. Disabled hooks, managed policy restrictions or a process that drops the inherited event environment prevent reporting. The integration never changes `disableAllHooks`, permission rules or hook trust.

## Event flow

1. Each host-owned PTY receives its own `AOW_AGENT_ENDPOINT` and `AOW_AGENT_TOKEN`.
2. Codex command hooks call `aow agent-event`; official `notify` calls `aow agent-notify` on `agent-turn-complete`.
3. The loopback ingress validates the per-terminal bearer token, rejects browser-origin requests, limits payload size, and maps the event to its host-owned terminal. No surface cookie can publish an event.
4. `AgentSessions` keeps a bounded in-memory snapshot. The connector pushes `agent.sessions` only to authenticated extension connections that opt in with `agentSessions: true` in hello; reconnect sends a fresh snapshot. Updates merge over 75 ms windows. Clients without that subscription keep receiving only the base protocol. Revocation stops delivery. PTY exit/close removes its sessions.
5. The extension coordinator aggregates all connected runtimes. The selected tab in each browser window receives live page updates; switching tabs or windows sends the latest snapshot, including read/dismiss state. Intermediate background-page states are not replayed. Terminal WebSocket viewers remain independent. Live session updates do not rewrite unchanged stored preferences.
6. `terminal.activate` crosses the content script and authenticated native wrapper, with a request ID, nonce, source/origin checks and an acknowledgement. The terminal resolves the exact ID against a fresh host list. Missing terminals show an error instead of opening another one. Presentation never sends shell commands or keystrokes to approve a request.

| Signal | Presentation |
| --- | --- |
| `SessionStart` | Ready; compact restarts retain the previous status |
| `UserPromptSubmit` | Working; a short prompt excerpt becomes the title |
| `PreToolUse` / `PostToolUse` | Working; matching post-tool evidence clears pending approval |
| `PermissionRequest` | Needs approval and attention notification |
| Codex `notify: agent-turn-complete` / Claude Code `Stop` | Completed and attention notification for an existing lifecycle session; unknown completion-only threads are ignored |
| `Interrupt` | Interrupted |
| `SessionEnd` | Ended; hidden from the current list |

For Codex, `Stop` is intentionally not a completion signal: another Stop hook can continue the turn, so completion uses `notify`. Claude Code uses `Stop`, with the continuation limitation described above. Duplicate completions and stale previous-turn completions are ignored. Tool output, shell commands and assistant responses are not forwarded into page presentation.

Codex's documented `PermissionRequest` input does not include a tool-call ID. Pending requests are counted by tool name, and matching `PostToolUse` events reduce that count; completion, interruption and a new user turn also clear it. Concurrent calls with the same name, a denial without a post-tool event, or an external hook making a permission decision can leave the displayed approval status approximate until the next lifecycle event. The native terminal is authoritative for the actual decision. A killed Codex process that emits no lifecycle hook may remain in the snapshot until its shell is closed; PTY silence is not interpreted as completion.

The registry is host-memory scoped; it does not reconstruct history after a host restart. Page notifications are not OS notifications. Initial historical snapshots populate the list without replaying old toasts; newly received attention events are deduplicated by ID. Read IDs are kept in the background's bounded in-memory state.

## Extending to other agents

The connector contract `AgentSession` and `SurfaceAdapter.agentSessions` contain no Codex hook names. Another runtime can publish its own normalized sessions through that interface. The Claude Code terminal adapter normalizes its official events in the host. Future adapters should reuse the per-terminal binding and public status contract, not parse colored PTY text or make the frontend know agent-specific hook payloads.

## Verification

`pnpm test` includes real host/PTY tests that run the hook reporter and official notify payload through the packaged CLI, close the viewer, verify running/approval/completion push, reconnect, then close the terminal. It also covers config preservation, notification deduplication, text escaping, cross-frame trust checks, cold-load activation races and stale/missing targets.

For the interactive UI fixture: `pnpm build:preview`, `pnpm preview`, then open `http://127.0.0.1:4173/?activity`. The fixture explicitly labels its events as simulated.

Official schemas: [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Claude Code settings](https://code.claude.com/docs/en/settings), [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex notify](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications).

## One-command setup (macOS + Chrome)

The new `aow setup` entry configures the service, Chrome native pairing and Codex/Claude Code notifications together. Global npm installs run it when lifecycle scripts are permitted; the release shell installer calls it explicitly. Codex hook trust remains a first-use user action. Use matching 0.2.0 host and extension builds; release availability is tracked separately. See [One-command setup (macOS + Chrome)](one-command-setup.md).
