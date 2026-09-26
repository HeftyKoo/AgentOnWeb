# Your local terminal on AgentOnWeb

Open your real interactive login shell in the browser. Type `cd`, use Tab completion, aliases and history, and run installed command-line tools such as `codex`. Exiting a tool returns to the same shell. The host starts a new shell; it does not mirror an existing desktop terminal window. No specific coding CLI is required.

## One-time setup on macOS

From this checkout, build and install the package (Node.js 22.19+ and pnpm required):

```sh
pnpm install
pnpm --filter @agentonweb/terminal-host pack --pack-destination "$PWD/release"
npm install -g ./release/agentonweb-terminal-host-0.1.0.tgz
pnpm build:extension
aow service install
```

Load `apps/extension/.output/chrome-mv3` through Chrome’s **Load unpacked** action in `chrome://extensions` (Developer mode). The earlier store extension is the DSH edition; use the source build for Local terminal. Installation starts a per-user LaunchAgent and opens a private setup browser tab. On any website, open AgentOnWeb, click its discovery **+**, choose **Local terminal**, then approve the request in the setup tab. This pairing is remembered. Ordinary website pages cannot approve themselves.

After setup, you do not need a desktop terminal window. The service starts at login. Use the terminal directly in AgentOnWeb:

```sh
cd ~/Project/your-project
codex
```

The shell loads your normal login/interactive startup files. Those files can change its initial home directory, PATH or environment just as they do in a native terminal. Tools use your local installations, credentials and configuration. AgentOnWeb does not choose a model or override CLI permissions.

## Terminal controls

- **+** opens another independent local shell (up to eight). The selector switches between shells without stopping their processes.
- **×** appears on tab hover or keyboard focus and closes that shell and its running process after an in-page confirmation. Cancel or Escape leaves it running. Typing `exit` ends that shell normally; **+** opens a new one.
- Every connected view of the same terminal can type and paste immediately; input reaches the same shell and output is synchronized across views. Only the focused view controls terminal dimensions. Background views cannot resize the shell, and no manual takeover is needed.
- Tab dots show connected (green), connecting (amber), disconnected (red), or background/exited (gray). **Reconnect** appears only when disconnected; connecting shows a disabled spinning indicator. Reconnect and page refresh restore the same host-owned terminal. Shell directory, history, draft input and running commands remain in the process. Uncertain input is never resent.
- Tabs follow the shell’s current directory until manually renamed. Long names are truncated with an ellipsis; hover to see the full current path.
- Right-click a tab and choose **Rename**, double-click its name, or focus it and press **F2** to rename it. Names are shared across views through the existing WebSocket and retained for the life of that terminal session. Directory titles update after shell output; idle surfaces do not poll the terminal list.
- Hover a terminal tab to see that shell’s current directory, including changes made with `cd`.
- **Command+V** pastes clipboard images directly into the active native CLI; text keeps the terminal’s normal paste behavior. Image paste sends Ctrl+V to the active native program. In Codex this uses the local system clipboard; it is not a browser upload. In a shell Ctrl+V retains the shell's normal meaning.
- DSH remains a separate runtime that you can switch to without stopping your shell.

Closing the overlay or a browser tab does not stop the shell. Logging out, rebooting, or stopping the service ends live processes. Individual tools may provide their own saved-session recovery after a machine restart.

## Service management

```sh
aow service open       # Reopen the private browser setup/connection-management page
aow service status
aow service uninstall  # Stop the service and remove automatic startup
```

Uninstalling stops its live terminals but does not delete saved CLI history. The service is installed only for your macOS user. It uses `~/Library/LaunchAgents/com.agentonweb.terminal.plist`; diagnostics are at `~/.agentonweb/terminal/service.log`. Keep the installed Node and package paths available; reinstall the service after moving/removing them. Re-running install while loaded updates the next-login configuration without interrupting live terminals. New host code takes effect after the host restarts. To update immediately, finish your shell work, run `aow service uninstall`, then `aow service install`; uninstall stops live processes. Browser grants and CLI history remain.

Only one host may use a state directory. A dead PID is recovered automatically, with lock updates serialized through `host.pid.guard`. If `host.pid` is invalid or an interrupted update leaves `host.pid.guard`, the startup error identifies the affected path. Confirm that no host is running or starting for that directory before removing the reported file or empty guard directory. Do not remove a live host's lock.

Automatic installation currently supports macOS. On other platforms, or when you want a foreground host, use `aow terminal`. Keep that host process running and approve through its printed private setup link. Windows/Linux and live Firefox/Safari have not been acceptance-tested.

## Local connection boundary

The service binds only to IPv4 loopback. Connector discovery uses ports 3847–3850. HTTP validates Host; terminal WebSockets require exact Origin, a delegated HttpOnly cookie and a single-use expiring ticket tied to a terminal. Management writes require same-origin JSON requests. A separate administrator cookie, obtained only through the private one-time setup link, controls browser pairing and revocation. Extension-delegated terminal credentials cannot approve another extension.

The private setup link is stored in an owner-only state directory and rotates when opened. Do not share it. Revoking a connection rotates the terminal secret and closes viewers of this host. Remaining authorized browsers reconnect with their existing grants to obtain a fresh surface credential. Shell processes continue, and DSH is unaffected. Browser-reserved shortcuts and terminal-emulator limitations still apply.

This package is not published to npm yet. Use the local archive. See the repository's verification records for actual platform and interaction coverage.

## Codex session notifications

Run `aow codex-hooks install`, review/trust **AgentOnWeb session status** in Codex `/hooks`, then start Codex inside a new terminal created by the updated host. The page launcher lists sessions and notifies on completion or approval requests; clicking opens the exact terminal, where approvals remain native. Existing hook/notify configuration is preserved with backups. See [event setup and architecture](../../docs/agent-notifications.md).

## One-command setup (macOS + Chrome)

The new `aow setup` entry configures the service, Chrome native pairing and Codex notifications together. Global npm installs run it when lifecycle scripts are permitted; the release shell installer calls it explicitly. Codex hook trust remains a first-use user action. The package and installer are not published yet. See [One-command setup (macOS + Chrome)](../../docs/one-command-setup.md).

Global setup starts a login service, registers a Chrome native host and updates Codex hooks/notify with backups. Set `AOW_SKIP_SETUP=1` to install without automatic configuration. Before `npm uninstall -g @agentonweb/terminal-host`, finish live terminal work and run `aow uninstall` to reverse these integrations. It stops service terminals, preserves user settings/history/backups, and restores the original notify command. `aow codex-hooks uninstall` removes only the Codex integration.
