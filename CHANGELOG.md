# Changelog

## Terminal host 0.4.3 — 2026-10-22

- Recognize an older running terminal host after the CLI package has been upgraded. Report its missing maintenance interface and allow explicit `aow update --force` or `aow service restart --force` only after confirming the host PID belongs to the macOS service. Preserve the running service if npm installation fails.
- Make `aow update --force` reinstall and restart even when the CLI already matches the stable npm version, while still refusing downgrades.
- Give manual npm update checks a 15-second request timeout and one retry for transient failures. Keep automatic checks at three seconds with existing backoff, and report HTTP failures separately from timeouts.

### Upgrade

CLI 0.4.1/0.4.2 cannot recover an older running host through the new force path until the updated CLI is installed. Finish terminal work, run `aow service uninstall`, then rerun the installer to install 0.4.3 and start its host. CLI 0.4.3 can use `aow update --force` to reinstall the stable version and restart a verified older macOS service. Saved history, browser grants and integration settings remain. Extension 0.4.1, DSH 0.4.0 and connector protocol 1 are unchanged.

## Terminal host 0.4.2 / Extension 0.4.1 — 2026-10-20

- Select terminal text with an ordinary mouse or trackpad drag, including inside TUIs with mouse reporting. Right-click to copy, or use the existing copy shortcut. Preserve app clicks, scrolling, native word/line selection and scrollbar interaction.
- Keep selection gestures from triggering the double-Option website interaction shortcut.
- Include keyboard-driven checkbox agent setup and readable Matrix-style CLI output in terminal host 0.4.2.
- Apply acknowledged mode-button clicks immediately and ignore stale replies in extension 0.4.1.
- Safari uses version 0.4.1, build 10. DSH remains 0.4.0; connector protocol remains 1.

### Upgrade

The terminal copy fix requires terminal host 0.4.2. Finish active shell work, then run `aow update` from a separate macOS Terminal. Update browser extensions when each store approves 0.4.1; store submission and public availability are separate states.

## Terminal host 0.4.1 — 2026-10-13

- Add terminal-host version reporting, daily asynchronous npm update checks with caching/backoff, persistent opt-out, and reminders in the private management page and service log.
- Add `aow update` for explicit global npm upgrades in the original prefix, retaining CLI integrations and enrolled browser origins. Add `aow service restart` and running-version verification. Both protect live shells unless `--force` is explicit and pause new shells during maintenance.
- Keep automatic checks separate from installation; version-pinned release installers and the extension/DSH update paths remain independent.

### Upgrade

For the first upgrade from 0.4.0 or earlier, finish terminal work, run `aow service uninstall`, and rerun the installer. This installs 0.4.1 and starts the update-capable host. Subsequent upgrades use `aow update` in a separate macOS Terminal after exiting or closing live shells. `aow service restart` reloads already-installed code; explicit `--force` ends live tasks. Chrome/Firefox/Safari extensions and the DSH plugin remain at 0.4.0 with connector protocol 1.

## 0.4.0 — 2026-10-13

- Add Pi session status, approval and completion notifications alongside Codex and Claude Code.
- Detect installed CLIs during `aow setup` and prompt for the integrations to enable while preserving existing settings.
- Recover disconnected runtime sessions and preserve independent visibility and presentation across browser tabs.
- Forward enabled default mode shortcuts from terminal input without sending their key bytes to the shell; respect cleared and remapped browser bindings.
- Focus native terminal input on explicit Focus actions, preserve input focus in Chill, and restore the most recently focused website control in Watch. Preserve terminal focus during background updates and rapid keyboard mode changes.
- Align extension, terminal host, DSH package and installer at 0.4.0. Connector protocol remains 1. Safari uses version 0.4.0, build 9.

### Upgrade

Update the browser extension and terminal host together. Finish active terminal work, run `aow service uninstall`, then rerun the installer or `aow setup` to start the updated host. Restart DSH after updating its plugin. Browser updates become available after each store approves them.

## 0.3.0 — 2026-10-12

- Add Claude Code session status, approval and completion notifications through official observational hooks, alongside existing Codex support. `aow setup` installs both integrations; `aow claude-hooks install|uninstall` manages Claude hooks independently while preserving other settings.
- Track resumed Claude turns correctly and resolve the lightweight hook reporter from the installed package, including npm bin symlinks.
- Keep the active terminal iframe visible during status and presentation updates so typing retains focus.
- Apply Chill opacity to ANSI terminal cell backgrounds while keeping text readable and Focus mode opaque.
- Align the extension, terminal host, DSH package and version-pinned installer at 0.3.0. Connector protocol remains 1. Safari uses version 0.3.0, build 8.

### Upgrade

Update the browser extension and rerun the installer. Finish active terminal work before `aow service uninstall`, then run `aow setup` to start the updated host. Review AgentOnWeb hooks in your CLI's `/hooks` and start a new Codex or Claude Code session. Browser updates become available after each store approves them.

## Extension 0.2.1 — 2026-10-10

- Restore default mode shortcuts on ordinary webpages in Arc when browser extension commands are not dispatched. Respect cleared and remapped bindings, and leave editable webpage controls to the browser and website.
- Coalesce page and browser-command events for the same tab and mode so one physical shortcut does not switch modes twice.
- Browser-owned shortcuts and native workspace iframes still depend on browser commands. Arc Control+2 may switch Spaces; Chrome mode shortcuts work in both webpages and terminal iframes.
- This patch updates the browser extension only. Local terminal and DSH packages retain their independent versions; no service reinstall is required.

## Terminal host 0.2.1 — 2026-10-08

- Make `aow service` open the private connection page by default, add service help, and report usage/setup errors without a Node stack trace.
- Make `aow` available in the current terminal without sourcing a profile when Node's command directory is writable and on PATH. Update older AgentOnWeb npm links while preserving unrelated commands, and keep zsh/bash/fish startup configuration for future terminals.
- Pin the public installer to terminal-host 0.2.1. The extension and DSH plugin remain at 0.2.0 with connector protocol 1.
- Refresh npm metadata during installation so a cached older version index cannot hide the newly published package.

## 0.2.0 — 2026-09-29

- Run real local login shells in the browser, with up to eight terminal tabs, directory-based names, shared renaming, clipboard integration and reconnectable views. Connected views share input; only the focused view changes terminal dimensions.
- Keep Local terminal and DSH connected independently, switch runtimes without stopping work, and open exact terminal tabs from the page launcher.
- Display Codex lifecycle status, completion and approval notifications. Approvals stay in the native CLI; hook trust is a separate first-use action.
- Configure the macOS service, Chrome native pairing and Codex hooks with `aow setup`; support explicit unpacked-extension enrollment, repair and `aow uninstall`.
- Validate the latest DSH (0.1.7-rc.2 at preparation time), install DSH via `@latest`, and add CI coverage for actual plugin installation, native settings and browser authentication.
- Preserve the DSH stale-cookie authentication fix from the default branch while supporting multiple local runtimes.
- Align package/extension/Safari marketing versions at 0.2.0 (Safari build 6), add audited terminal-host npm publication and a version-pinned installer, and refresh English/Chinese guides, support and privacy documentation.

### Upgrade and support

Use the 0.2.0 terminal host and extension together. Package installation does not replace a running host: finish terminal work, stop it with `aow service uninstall`, then run `aow setup` to start the updated code. Restart DSH separately after updating its plugin. Live terminal acceptance covers macOS/Chrome; automatic setup only supports that combination. Other platforms and live Firefox/Safari terminal use require further acceptance testing.

Browser-store updates become available after each store approves them. See the [GitHub releases](https://github.com/HeftyKoo/AgentOnWeb/releases) for downloadable packages and the [release guide](docs/releasing.md) for publication details.
