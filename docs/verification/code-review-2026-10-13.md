# Review regressions — 2026-10-13

Scope: the nine findings reviewed from `ab4a7564c1afe673315ee59978628908065f20db`, on local branch `codex/review-regressions`.

## Fixes and regression boundaries

| Finding | Corrected behavior | Retained regression |
| --- | --- | --- |
| Expired or deleted native cookies | Renew the actual runtime surface at 80% of its lifetime, refresh expired cached leases, and invalidate installations when Chrome removes a cookie. Concurrent callers await one pending renewal. | Coordinator clock/transport tests; Chrome and Safari lease tests; background cookie-removal test. |
| One runtime blocks another | Serialize transport callbacks per runtime and credential persistence separately; a waiting DSH surface cannot block terminal notifications or runtime selection. | Hold one surface response while delivering another runtime's sessions and activating it. |
| DSH restore overwrites an intervening selection | Capture the native selection before awaiting session refresh; retain a selection changed during that wait. | Actual built client with a deferred native session refresh. |
| Hidden DSH tabs overwrite shared selection | Require foreground visibility for writes, invalidate pending restores on hiding, and discard queued writes from an earlier hydration. | Previously visible tab, queued writes, and hide-during-restore tests. |
| Codex tool hooks load the full host | Install the existing lightweight `agent-hook.js codex` entry. | Execute the installed hook command with heavy runtime dependency imports forbidden. |
| Failed revocation loses the visible grant | Serialize read/modify/persist, publish the new in-memory grant list only after successful persistence, and re-enable the UI action after an error. | Real filesystem rename failure, retry, callback, reopen, and UI button tests. |
| Reconnection stops after HTTP failure | Retry network failures, HTTP 5xx and 429 with bounded exponential delays; stop for permanent 4xx and revoked sockets. | Two failed HTTP attempts followed by recovery; permanent rejection stops retries. |
| Terminal additions/deletions miss other pages | Broadcast the full registry after create/close and reconcile existing tab elements without rebuilding the focused terminal. Empty pages poll for a newly created session. | Real-host WebSocket registry test and frontend DOM retention test. |
| Split UTF-8 request bodies corrupt names | Accumulate bounded byte buffers and decode once after the complete body arrives. | Real HTTP request splitting a Chinese character across chunks. |

Each original regression was observed failing before its corresponding implementation change. Review then caught the concurrent-renewal gap; its regression also failed before the follow-up fix.

## Automated checks

`pnpm check` passed on 2026-10-13:

- Privacy and architecture checks; TypeScript project checks.
- 52 test files: **321 passed, 1 skipped**.
- Chrome MV3, Firefox MV2 and Safari MV2 builds and manifest checks.
- Safari native WKWebExtension validation.

The skipped test is the pre-existing optional installed-DSH HTTP bridge test, enabled by `DSH_CONNECTION_MODULE`. The DSH client tests ran against the built plugin.

`git diff --check` also passed. These are local checks, not store publication or installed-extension verification.

## Browser regression runner

**Passed:** Chrome for Testing **156.0.8078.4**, 2026-10-13 11:07:21–11:07:37 Asia/Shanghai. All six scenario groups passed and the report confirmed cleanup. A subsequent process check found no remaining test host or Chrome processes.

Run after building the current source:

```sh
node scripts/check-review-regressions-browser.mjs \
  --deps /path/to/prefix-containing-node_modules-playwright-core \
  --chromium '/path/to/Google Chrome for Testing'
```

The runner launches visible Chrome with a fresh profile and attaches with `noDefaults: true` so actual browser focus/visibility events are used. It copies the current extension into a temporary directory and removes only `nativeMessaging` from that test manifest to prevent machine-wide native-host pairing. It copies the built terminal host and gives the copy the unique runtime ID `terminal-review-qa`; all host state and PTYs use a temporary home with `/bin/sh`.

Browser checks cover two website partitions, manual approval, remote terminal creation/Unicode rename/deletion, retained tab DOM and focus, two injected HTTP 503 failures followed by automatic reconnection and actual PTY input, Chrome cookie removal/reinstallation and clock-driven expiry, and a real failed authorization-file write followed by UI retry.

The DSH browser scenario loads the actual built plugin in an iframe with a native sessions interface fixture. It changes selection while refresh is pending, then moves the real browser tab to the background and checks that stale native selection events cannot write the shared bookmark. This validates browser visibility and plugin behavior; it does not exercise a complete DSH installation or call a model.

The runner writes a timestamped report and screenshots to ignored `output/review-regressions/`, confirms created processes have exited, and removes its temporary profile and host files. It does not install a service or alter user CLI integrations.

Evidence from this run: `report.json`, `terminal-recovered.png`, and `dsh-selection-fixture.png` in that output directory.

## Hook startup measurement

Node 24.13.0, two warmups and 12 measured launches per entry, reporting disabled by empty endpoint/token environment variables:

| Entry | Median | Range |
| --- | --- | --- |
| Compatibility `cli.js agent-event` | 55.5 ms | 53.3–56.2 ms |
| Installed `agent-hook.js codex` | 18.8 ms | 18.4–19.2 ms |

This local measurement isolates process/module startup, not a full agent turn or network delivery. Raw results are in ignored `output/review-regressions/hook-startup.json`.

## Delivery boundary

This record covers the implementation, regression tests and local browser validation. Package releases, browser-store submissions and replacement of the installed extension require separate delivery; the checks above do not establish those states.
