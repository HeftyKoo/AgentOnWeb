# Agent sessions and page notifications

The page launcher shows Codex sessions across local terminals. Running sessions have a count badge; sessions requiring approval appear first with an amber status. Completion and permission requests produce a dismissible page notification. Selecting a row or notification opens that exact terminal, including when its surface has not loaded yet or another runtime is selected. Approval decisions remain in the native Codex TUI.

## Enable Codex events

Build/install the updated terminal host and extension together. For a source checkout:

```sh
pnpm --filter @agentonweb/terminal-host build
node packages/terminal-host/lib/cli.js codex-hooks install
```

With the packaged CLI, run `aow codex-hooks install`.

The installer backs up and updates `hooks.json` and `config.toml` in `CODEX_HOME` (default `~/.codex`). Existing hook groups and unrelated TOML formatting/comments remain intact. If a `notify` command already exists, the new completion reporter forwards every original payload to it using its original argument array, without a shell. Running the installer again updates the integration without nesting forwarders. Re-run it if the installed Node or CLI path changes.

If `config.toml` cannot be safely parsed, the installer warns and keeps it unchanged; hooks still install. Fix the file and rerun installation to enable completion notifications. `aow codex-hooks uninstall` removes the integration and restores the previous notify command without overwriting later user settings.

Open `/hooks` in Codex, review and trust the **AgentOnWeb session status** hooks, and start a new Codex session inside a terminal created by the updated host. Existing shells started by an older host do not have the event environment. Hooks are observational: they never approve, deny, or rewrite a command. Outside AgentOnWeb terminals they do nothing, and the existing `notify` command continues to run.

A project or profile that overrides `notify`, disabled/untrusted hooks, or launching Codex through a process that drops the inherited environment can prevent events. Install into the `CODEX_HOME` used by that Codex process. Hook failures are deliberately fail-open for the CLI: they do not interrupt coding.

## Event flow

1. Each host-owned PTY receives its own `AOW_AGENT_ENDPOINT` and `AOW_AGENT_TOKEN`.
2. Codex command hooks call `aow agent-event`; official `notify` calls `aow agent-notify` on `agent-turn-complete`.
3. The loopback ingress validates the per-terminal bearer token, rejects browser-origin requests, limits payload size, and maps the event to its host-owned terminal. No surface cookie can publish an event.
4. `AgentSessions` keeps a bounded in-memory snapshot. The connector pushes `agent.sessions` only to authenticated extension connections that opt in with `agentSessions: true` in hello; reconnect sends a fresh snapshot. Updates merge over 75 ms windows. Clients without that subscription keep receiving only the base protocol. Revocation stops delivery. PTY exit/close removes its sessions.
5. The extension coordinator aggregates all connected runtimes. Only the active tab in the last focused browser window receives live page updates; switching tabs or windows sends the latest snapshot, including read/dismiss state. Intermediate background-page states are not replayed. Terminal WebSocket viewers remain independent. Live session updates do not rewrite unchanged stored preferences.
6. `terminal.activate` crosses the content script and authenticated native wrapper, with a request ID, nonce, source/origin checks and an acknowledgement. The terminal resolves the exact ID against a fresh host list. Missing terminals show an error instead of opening another one. Presentation never sends shell commands or keystrokes to approve a request.

| Signal | Presentation |
| --- | --- |
| `SessionStart` | Ready; compact restarts retain the previous status |
| `UserPromptSubmit` | Working; a short prompt excerpt becomes the title |
| `PreToolUse` / `PostToolUse` | Working; matching post-tool evidence clears pending approval |
| `PermissionRequest` | Needs approval and attention notification |
| `notify: agent-turn-complete` | Completed and attention notification for an existing lifecycle session; unknown notify-only threads are ignored |
| `Interrupt` | Interrupted |
| `SessionEnd` | Ended; hidden from the current list |

`Stop` is intentionally not a completion signal: another Stop hook can continue the turn. Duplicate completions and stale previous-turn completions are ignored. Tool output, shell commands and assistant responses are not forwarded into page presentation.

Codex's documented `PermissionRequest` input does not include a tool-call ID. Pending requests are counted by tool name, and matching `PostToolUse` events reduce that count; completion, interruption and a new user turn also clear it. Concurrent calls with the same name, a denial without a post-tool event, or an external hook making a permission decision can leave the displayed approval status approximate until the next lifecycle event. The native terminal is authoritative for the actual decision. A killed Codex process that emits no lifecycle hook may remain in the snapshot until its shell is closed; PTY silence is not interpreted as completion.

The registry is host-memory scoped; it does not reconstruct history after a host restart. Page notifications are not OS notifications. Initial historical snapshots populate the list without replaying old toasts; newly received attention events are deduplicated by ID. Read IDs are kept in the background's bounded in-memory state.

## Extending to other agents

The connector contract `AgentSession` and `SurfaceAdapter.agentSessions` contain no Codex hook names. Another runtime can publish its own normalized sessions through that interface. A future Claude Code or pi terminal adapter can normalize its official events in the host; it should reuse the per-terminal binding and public status contract, not parse colored PTY text or make the frontend know agent-specific hook payloads.

## Verification

`pnpm test` includes real host/PTY tests that run the hook reporter and official notify payload through the packaged CLI, close the viewer, verify running/approval/completion push, reconnect, then close the terminal. It also covers config preservation, notification deduplication, text escaping, cross-frame trust checks, cold-load activation races and stale/missing targets.

For the interactive UI fixture: `pnpm build:preview`, `pnpm preview`, then open `http://127.0.0.1:4173/?activity`. The fixture explicitly labels its events as simulated.

Official schemas: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex notify](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications).

## One-command setup (macOS + Chrome)

The new `aow setup` entry configures the service, Chrome native pairing and Codex notifications together. Global npm installs run it when lifecycle scripts are permitted; the release shell installer calls it explicitly. Codex hook trust remains a first-use user action. The package and installer are not published yet. See [One-command setup (macOS + Chrome)](one-command-setup.md).
