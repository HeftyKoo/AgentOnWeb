# Arc Pi notifications and mode clicks — 2026-10-19

## Findings and changes

- The installed Pi is 1.1.0. Its default configuration had no `extensions/agentonweb.ts`, so ordinary Pi sessions could not report lifecycle events. Installed the repository's observational extension with `node packages/terminal-host/lib/cli.js pi-extension install`. Model settings and existing packages were preserved. Existing Pi processes need `/reload` or a new session.
- Mode buttons sent `mode.set` but ignored its acknowledged result, relying entirely on an unsolicited background broadcast. Keyboard commands additionally receive a targeted `surface.show`. A deterministic test reproduces the button staying in Chill after a successful Focus acknowledgement when the broadcast is absent.
- Buttons now apply the mode confirmed by their own request. A revision guard rejects stale click replies and replies superseded by keyboard/open commands. Only the mode is applied, preserving newer connection, session and opacity updates.
- Ordinary page body replacement did not remove the overlay. The user's specific hot-update framework/page was not available, so hot reload itself is not established as the cause. Missing broadcast delivery is the reproduced failure condition and repaired path.

## Automated verification

- Before the fix: `node node_modules/vitest/vitest.mjs run apps/extension/src/content.test.ts` failed the two new acknowledgement tests: expected Focus/Watch, received Chill.
- After the fix: the complete suite passed **386 tests**, with one existing optional DSH test skipped, across 56 files. This includes real Pi RPC and authenticated host/PTY lifecycle integration.
- Three regression scenarios cover successful acknowledgement without broadcast after body replacement, out-of-order replies preserving newer state, and keyboard precedence/failed replies.
- TypeScript, architecture and privacy checks, the Chrome extension build and `git diff --check` passed. The final content test was rerun after extending its assertion to preserve live Pi session state.
- The DSH smoke test was also verified against native DSH **0.2.1-rc.2**. Its account-first onboarding shows **Get started → Close**, while older releases show **Configure later**. The test now handles both and opens Settings through the account menu when present. The original command reproduced the old button timeout; the updated command passed plugin installation, authenticated API checks and the native AgentOnWeb settings page with no page errors.

## Native Arc verification

Reloaded Arc's existing unpacked AgentOnWeb extension `kphdajdklejladebbpbjmghcjflhdpnl`, loaded from `apps/extension/dist`, with the rebuilt content script. The existing terminal host remained running; it was not restarted.

Used a new verification shell, native Pi 1.1.0 and an isolated local deterministic model endpoint. Its temporary configuration loaded the exact installed AgentOnWeb loader. No paid provider, user model credentials or project task was used.

1. A real Pi turn completed in Watch and produced a **Completed** page notification and a single Pi session row.
2. Clicking the notification selected the original Pi terminal with the completed answer.
3. Replacing the website body retained the overlay; coordinate mouse clicks switched Focus, Chill and Watch.
4. Reloading the whole browser page retained the native Pi process and did not replay the dismissed notification. A second real turn produced a new Completed notification.

The verification terminal, browser tabs, local model server and temporary configuration were removed after acceptance. The pre-existing terminal and host service were retained.

These are page notifications, not macOS Notification Center notifications. Previously open websites need a refresh to load the rebuilt content script. The repair is installed locally in Arc; npm publication and browser-store releases are outside this verification.
