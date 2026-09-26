# Browser local-shell acceptance — 2026-09-20

## Current review acceptance

Tested through the Computer plugin's native Google Chrome UI on macOS, using the user's existing visible browser. UI actions used Computer; no headless browser, CDP script or DOM injection substituted for this acceptance.

The current extension was built from the working tree and reloaded through `chrome://extensions`. The terminal archive was installed with production dependencies in a disposable directory with its own HOME and zsh startup fixture. To coexist with the user's live installed host, only the fixture bundle's runtime ID and display name were changed to `terminal-acceptance` / `Local terminal · acceptance`; shell, HTTP, authorization and terminal UI logic were unchanged. This temporary runtime appeared alongside the existing Local terminal during testing. The installed user service was not restarted.

| UI exercise | Observed result |
| --- | --- |
| Open the private setup link from a local file | Setup opened directly with terminal controls after the Strict-cookie redirect fix. The consumed token disappeared from the address bar. |
| Discover and pair on `https://example.org/` | The temporary runtime was discovered; **Allow connection** in its private setup page authorized the website view. |
| Native management page while DSH was selected | Terminal setup remained visible without the DSH overlay after the native-origin fix. |
| Shell startup, directory and aliases | `cd /tmp`, `pwd` and fixture alias `aow_hello` produced `/tmp` and `AOW_ALIAS_OK`. |
| Installed CLI | `codex --version` returned `codex-cli 0.155.1`. |
| Text and bracketed paste | Chinese, emoji and multiline text rendered correctly. `printf '%s' '中文 👋' \| xxd -p` returned `e4b8ade6968720f09f918b`. |
| Completion and history | Tab completed `/tm` to `/tmp`; Up recalled and executed the preceding command. |
| Multiple shells | Created Terminal 2 and changed it to `/`; switching back to Terminal 1 preserved `/tmp`, output and draft input. |
| Refresh and reconnect | Repeated page reloads and **Reconnect** retained the same shell, output and unsubmitted `echo AOW_DRAFT_OK`. Executing the restored draft printed `AOW_DRAFT_OK`. |
| Presentation | Chill showed the website behind terminal output, Focus used an opaque background, and Watch exposed the website. The Watch view's **Learn more** link navigated to IANA. |
| Presentation after reload | Following the delayed-authorization fix, repeated refreshes retained the translucent Chill background at 60%. The opacity control changed 60 → 59 → 60. |
| Runtime switch | DSH's actual native workspace rendered; switching back restored the terminal and its draft. No DSH prompt was submitted. |
| Control takeover | Taking control in the standalone management tab made the website read-only; taking control in the website reversed this, and input worked afterward. |
| Normal process exit | `exit` in Terminal 2 showed exit code 0 and disabled control and paste actions. Terminal 1 remained available in the other view. |
| Revocation | **Revoke** removed the temporary browser grant, closed terminal access and showed the authorization-revoked state on the website. |
| Cleanup | Stopped the temporary host, removed its disposable files, and reloaded the final extension. The dock showed only the original Local terminal and DSH. DSH was visibly selected while its workspace rendered, including after a fresh discovery. The original installed host remained running. |

Live testing exposed three behavior defects, now covered by automated regressions and UI rechecks: cross-site setup redirects with Strict cookies, overlays covering another runtime's management page, and dropped presentation settings while background authorization was pending.

Cleanup additionally exposed stale disconnected runtime entries and stale selection after restoring the extension. Regressions now cover removal after fresh discovery, preserving live/credentialed runtimes, rejecting old callbacks after an ID reappears, and keeping the visible surface consistent with the selected dock item. Final UI verification confirms the temporary entry is absent; fresh-discovery pruning itself is covered by the automated lifecycle tests.

## Earlier baseline acceptance

Before this review, the installed macOS host was exercised in the same visible Chrome with the user's normal zsh configuration: `cd` into the project, launch the native Codex TUI, receive `AOW_SHELL_CODEX_OK`, exit back to the same shell, refresh history, create/switch/close a second terminal, and install/start the per-user LaunchAgent from the packed archive. Those observations describe the preceding installed build. The current isolated pass above verifies the review changes without replacing that live service or repeating a model-backed task.

## Automated checks and limits

`pnpm release:audit` passed with 27 test files, 122 passing tests and one optional installed-DSH-bridge test skipped. This includes TypeScript, architecture/privacy checks, Chrome/Firefox/Safari builds/manifests, Safari native validation and reproducible archives. The packed-host check installs production dependencies in isolation, verifies browser assets and exercises a real authenticated shell. Host integration tests cover single-use setup links, continued shell lifetime, browser-grant revocation and rejection of delegated administrator access/cross-origin writes.

Live terminal coverage is macOS/Chrome. Windows/Linux and live Firefox/Safari remain unverified. OS IME composition, clipboard-image delivery, external-editor launch and native login were not tested in this pass. The Computer API rejected a modifier-only Option key, so the double-Option shortcut was not newly verified through Computer; mode buttons and Watch webpage interaction were verified. Shell startup files can change the initial directory. Stopping the host, logging out or rebooting ends live shells; individual tools own saved-session recovery.

No code was committed or published. The temporary browser grant was revoked, the temporary host was stopped, and its disposable files and three test tabs were removed. The user's installed host and its existing terminal processes were preserved.
