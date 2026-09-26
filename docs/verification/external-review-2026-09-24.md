# External review adjudication — 2026-09-24

The eight supplied findings were checked against the current working tree. Existing unrelated changes were preserved. This report covers source changes and generated release artifacts; it does not claim a deployed service or store update.

| Finding | Verdict | Result |
| --- | --- | --- |
| 1. Global installation fails outside macOS or under root | Confirmed in the automatic setup path | Postinstall warns and skips setup in these environments. Explicit setup still rejects unsupported platforms/root. Supported setup failures still fail installation. Native dependency installation remains a separate platform requirement. |
| 2. Extension/plugin versions still 0.1.1 | Release preparation issue | Extension and DSH plugin now use 0.1.2 in package manifests, release contract, artifact names and README installation examples. The unpublished terminal host remains 0.1.0. Safari containing-app version/signing/upload are a separate release workflow. |
| 3. Switching nvm versions breaks hardcoded paths | Partially correct; the trigger is overstated | Switching versions does not remove the old executable/package. Removing or relocating them does break integrations. Setup now checks its executable and CLI before writing integrations, prints migration guidance, and documents reinstall/setup/service activation. Absolute paths remain intentional; no automatic replacement Node/package resolution is claimed. |
| 4. Reconnection can wait for the 30-second alarm | Confirmed latency opportunity; not established as a new regression against HEAD | Added a 3-second first retry with exponential backoff capped at 30 seconds while the worker is alive. Keep the persistent alarm for suspended-worker recovery. Success or lost credentials clears the timer; revocation does not trigger automatic pairing. |
| 5. Only the last-focused window receives broadcasts | Confirmed for visible tabs in other windows | Broadcast to the active tab in every window. Hidden tabs still catch up on selection. Coalescing and preference-write deduplication remain. |
| 6. Read attention IDs disappear with the worker | Confirmed | Validate, deduplicate and persist the latest 256 read IDs; restore them before publishing state. Wait for persistence before acknowledging reads, and retain IDs when falling back from a removed runtime. Prompts and live session details remain excluded from saved preferences. |
| 7. Authorization failure leaves a blank wrapper | Confirmed | Show an error and Retry button. Retry rechecks authorization and asks the trusted parent content script for fresh tab-bound state, replacing a nonce lost during worker restart. Source, origin and nonce validation remain mandatory; denied requests cannot load a native iframe. |
| 8. Invalid hooks configuration interrupts uninstall | Confirmed for cleanup; backup claim overstated | Attempt hook removal, notify restoration, all native bridge files and service removal independently, then aggregate errors. Invalid files remain untouched and errors prevent a false success message. Unchanged repeated installs already avoid rewrites/backups, as regression tests verify. JSON formatting changes only when configuration actually changes; existing backups are retained. |

## Regression evidence

Before the main fixes, the targeted Vitest invocation produced **9 failures and 39 passes** across the seven selected files. Failures covered unsupported/root automatic setup, cleanup short-circuiting, missing reconnect timing, multi-window publication, read-state restoration and the blank authorization error. The additional stale-nonce recovery test also failed before implementing parent-state refresh.

Final `pnpm release:audit` passed:

- Privacy, architecture and TypeScript checks.
- **41 test files, 197 passing tests, 1 existing skipped test.**
- Workspace builds and Chrome MV3, Firefox MV2, Safari MV2 manifest checks.
- Safari native `WKWebExtension` validation.
- Reproducible extension, DSH plugin and terminal archives.
- Isolated terminal package installation with production dependencies, browser asset checks and real shell input/output.

`git diff --check` also passed. Browser interaction regressions exercise bundled production code in JSDOM; these changes were not loaded into the user's running browser extension. Linux/Windows were covered by deterministic postinstall platform simulations, not full native terminal acceptance on those operating systems.

## Artifacts and activation boundary

The final audit produced:

| Artifact | SHA-256 |
| --- | --- |
| `agentonweb-extension-0.1.2.zip` | `f14d249af2e80e18da720e73af65db7a70826fcbfdbec3884646c835d3a7b87c` |
| `agentonweb-dsh-surface-0.1.2.tgz` | `10bb50daf15539d2549e0c5f8266ab6244de2cc8e19665ed902a3813a7b514ff` |
| `agentonweb-terminal-host-0.1.0.tgz` | `d1944459337a1f4f2cb1fb553859c821f10e7167fdc9c8a0f6e1782c44895635` |

Changes remain uncommitted. No push, npm/store publication, extension reload or installed terminal-service restart was performed. Existing live terminal processes continue running their previously loaded host code.
