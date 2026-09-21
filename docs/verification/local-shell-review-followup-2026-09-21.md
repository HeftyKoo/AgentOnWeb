# External review follow-up — 2026-09-21

Scope: the existing uncommitted local-terminal work. The functional and robustness findings were checked against the current implementation; this follow-up preserves the surrounding changes.

## Confirmed and corrected

- **Embedded close confirmation:** replaced `window.confirm()` with an accessible in-page `<dialog>`. Cancel and Escape preserve the shell; confirmation captures the selected session, prevents duplicate submissions, and displays request failures within the dialog with retry available.
- **Lock recovery race:** a deterministic regression paused one stale-PID unlink while another caller acquired the lock. Before the fix both callers succeeded. An exclusive directory guard now serializes acquisition, stale-PID recovery and release. Release checks file identity and PID and is idempotent. Invalid PID files and interrupted guard updates are preserved with an explicit recovery path; the guard is deliberately not reclaimed on a timer because a suspended process may still own it. No new runtime dependency was added.
- **Session limit:** the ninth session returns HTTP 409 and a specific JSON message asking the user to close an unused terminal. The UI displays it. Unexpected failures retain a generic response. Closing an existing shell makes capacity available again.
- **Cookie comparison:** administrator and delegated cookie values use length-checked `timingSafeEqual`. Integration coverage rejects modified values, wrong lengths and prefixed cookie names, and retains the administrator/delegated boundary.
- **Shutdown:** host shutdown awaits HTTP listener closure, ends active HTTP connections and only then releases the host lock. A real-process regression leaves an HTTP request unfinished before SIGTERM and verifies clean exit and endpoint/lock cleanup.
- **Maintainability:** expanded compressed coordinator/host code, removed the `current` name shadow in `viewForTab`, placed extension regression tests inside their corresponding suites, and shared Option/Alt tap recognition through the connector contract package. Both consumers reject modified/composing/repeated key events and clear incomplete taps on blur.

The documented login-shell startup behavior and release-audit network/native-build requirements remain design choices.

## Verification

Before the fixes, the targeted command failed on concurrent lock ownership, invalid-PID diagnostics, the ninth session's HTTP status, blocked browser confirmation, and missing session-limit text:

```sh
pnpm exec vitest run packages/terminal-host/src/host-lock.test.ts packages/terminal-host/src/host.integration.test.ts apps/terminal-surface/src/main.test.ts
```

After the fixes:

- `pnpm typecheck` passed.
- `pnpm test` passed: 28 files, 138 tests passed, one optional installed-DSH-bridge test skipped.
- Privacy and architecture checks passed.
- Workspace, Chrome, Firefox and Safari builds passed, including browser manifest and Safari native extension validation.
- `git diff --check` passed.

Visible Chrome acceptance used the actual compiled terminal frontend inside an iframe on a different localhost port. An isolated fixture supplied a disposable session selection and a simulated close endpoint; extension authorization was intentionally absent. The dialog opened in the cross-origin frame, Cancel and Escape each left the close-request counter at zero, and confirmation changed it to exactly one. The temporary browser tab and fixture server were then closed. Real PTY session creation/closure and host shutdown were verified separately by integration tests. This does not claim a live Firefox/Safari or installed-extension acceptance run.

Changes remain in the working tree. No commit, push, publication, deployment, or replacement/restart of the user's installed terminal service occurred. The full release archive audit was not repeated for this follow-up.
