# Agent notifications verification — 2026-09-22

Branch: `support-cli`. Existing uncommitted terminal/navigation changes were retained. No commit, push, or release publication was performed. The initial automated verification was followed by the installed-service and real-browser checks recorded below.

## Verified

- `pnpm release:audit`: passed, including privacy/architecture checks, TypeScript, Chrome MV3 / Firefox MV2 / Safari MV2 builds, Safari native validation, reproducible archives, and isolated packaged-host install with real shell input/output.
- Vitest: 169 passed, 1 pre-existing skipped test, across 34 files.
- Real host/PTY integration invoked the packaged `agent-event` and `agent-notify` commands with official-schema fixtures; after closing the terminal viewer, the authenticated connector still received working, approval and completed states. Reconnection restored the latest snapshot and terminal close removed it.
- Packaged installer smoke test used a temporary `CODEX_HOME`, preserved model and approval settings and the original Stop hook, backed up existing configuration, and installed idempotently.
- Terminal activation tests covered authenticated cross-frame forwarding, wrong-origin rejection, delayed initial list races, request replay, and missing target IDs.
- UI tests covered session list entry from the icon, cold iframe activation, approval/completion notification deduplication, and rendering untrusted titles as text.
- Visible Chrome preview (`?activity`) showed the session list with approval first, an amber notification, and notification selection resolving terminal `one`. This preview explicitly used simulated events.

## Installed-service and Computer acceptance follow-up

- Updated the local launch service to the built repository CLI and restarted it. The prior host had two idle shells and no running agents. The replacement host started as PID 2657 at `http://localhost:65101`.
- Installed the observational hooks and completion notifier into the actual Codex configuration with installer backups, preserving prior configuration.
- Reloaded unpacked Chrome extension `bmdeaponkkhbcifbafbaoclipgfjfkhl` from `apps/extension/.output/chrome-mv3` through Chrome's extension UI.
- In the real page `https://example.com/?aow-acceptance=1`, launched Codex CLI 0.155.1 inside the native terminal through Computer. A real model turn returned `AOW completion acceptance OK`; the page displayed a Completed notification.
- Created a second shell and clicked the completion notification: the original Codex terminal became selected. The page icon opened the session list. Reloading the page restored the terminal and did not replay the dismissed notification.
- **Finding, subsequently resolved below:** the list showed two identically labeled Completed entries despite one observed model turn. This is not yet accepted as correct; inspect the underlying event/session identities and rerun the scenario before sign-off. The second shell's folder-based title also matched the first, so identical terminal names alone are not proof of an incorrect jump.
- **Initial hook-trust gate, subsequently resolved below:** Codex `/hooks` showed seven installed hooks, zero active, all requiring review. Opened the exact local command in the native review interface and requested confirmation before granting persistent hook execution. No hook trust bypass was used.

At that stage, working-state transitions, approvals and concurrent sessions were still pending. The trusted-hook follow-up below supersedes that incomplete matrix.

Approval responses stay in the native terminal. The official PermissionRequest payload lacks a tool-call ID, so concurrent same-name calls and denied requests can leave the summarized approval status approximate until subsequent lifecycle evidence. See [event design and limitations](../agent-notifications.md).


## Trusted-hook real acceptance follow-up

After the user explicitly approved the seven local hooks, enabled them through Codex `/hooks`; all seven showed Active. Used Computer to operate official Chrome for Testing and Codex 0.155.1 (`--no-alt-screen -s read-only -a on-request`). The primary Chrome continued to receive unrelated UI activity, so the independent browser was used for repeatable acceptance.

- Diagnosed the duplicate row against authenticated session snapshots: a second notify thread ID had no matching root lifecycle. Normal prompt and completion IDs matched. Added a regression test that failed with two sessions, then fixed the registry to ignore completion events for unknown sessions. Removed temporary identifier-only instrumentation.
- Rebuilt and restarted the live service at `localhost:53910`. The extension reconnected without pairing again.
- Real `sleep 12` turn displayed its prompt as Working, then Completed while a second terminal was selected. Completion notification selected the original terminal. The list contained exactly one session.
- A real escalated shell request produced Needs approval, its justification and the attention badge. Switched terminals, clicked the notification, and returned to the original native approval prompt. Selected **Yes, proceed** once (no persistent command rule). `/tmp/aow-approval-acceptance.txt` contained `AOW_APPROVED`; the session completed and emitted its completion notification.
- Denied a second request with Escape. The native CLI reported cancellation; `/tmp/aow-denied-acceptance.txt` did not exist, the approval notification cleared and the session became Interrupted.
- Started two real Codex sessions in separate terminals. Both showed Working with different prompt titles. Selecting the first list item selected its terminal. Interrupted that task; the other stayed Working and subsequently completed independently, with a notification. No false completion for the interrupted task was observed.
- Dismissed the second completion and refreshed the page. Both session states recovered, the dismissed notification did not replay, and selecting the second list entry selected the second terminal.
- Closed that completed QA terminal through the in-page confirmation; its session disappeared while the interrupted session remained. Exited the remaining Codex with Ctrl-D; the shell stayed available and active-session indicators cleared.
- Final focused regression, full `pnpm test` and TypeScript check passed: **176 tests passed, 1 existing skip, 37 test files**. The previous full release audit remains recorded above; this follow-up changed the registry guard, regression test and documentation.

These are concrete tested scenarios, not a guarantee covering every CLI version or environment. Native approval choices stay in Codex. Abrupt process termination without a lifecycle event and concurrent same-name approval correlation retain the documented limitations.
