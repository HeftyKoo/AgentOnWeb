# Changelog

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
