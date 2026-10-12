# AgentOnWeb terminal for Codex

Run Codex in your browser, keep several project terminals open, and return to the right session when a task finishes or needs approval.

## Install on macOS

Install [the Chrome extension](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe), Node.js 22.19+ and Codex, then run:

```sh
curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash
```

The installer configures the terminal service, Chrome connection and Codex notifications. Open a website, click AgentOnWeb and run:

```sh
cd ~/your-project
codex
```

For notifications, review and trust **AgentOnWeb session status** in Codex `/hooks`, then start a new Codex session. Your existing Codex settings are preserved.

The installer configures zsh, bash and detected fish installations. It also links `aow` into Node's command directory when that directory is already on PATH and writable, so the current terminal can use it without sourcing a profile. If another program owns that command or the directory is protected, use `"$HOME/.local/bin/aow" service` directly.

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
aow service            # Reopen the private browser setup/connection-management page
aow service open       # Explicit form of the same command
aow service --help
aow service status
aow service uninstall  # Stop the service and remove automatic startup
```

Uninstalling stops its live terminals but does not delete saved CLI history. The service is installed only for your macOS user. It uses `~/Library/LaunchAgents/com.agentonweb.terminal.plist`; diagnostics are at `~/.agentonweb/terminal/service.log`. Keep the installed Node and package paths available; reinstall the service after moving/removing them. Re-running install while loaded updates the next-login configuration without interrupting live terminals. New host code takes effect after the host restarts. To update immediately, finish your shell work, run `aow service uninstall`, then `aow service install`; uninstall stops live processes. Browser grants and CLI history remain.

Only one host may use a state directory. A dead PID is recovered automatically, with lock updates serialized through `host.pid.guard`. If `host.pid` is invalid or an interrupted update leaves `host.pid.guard`, the startup error identifies the affected path. Confirm that no host is running or starting for that directory before removing the reported file or empty guard directory. Do not remove a live host's lock.

Automatic installation currently supports macOS. On other platforms, or when you want a foreground host, use `aow terminal`. Keep that host process running and approve through its printed private setup link. Windows/Linux and live Firefox/Safari have not been acceptance-tested.

## Repair and uninstall

Run `aow setup` to repair configuration. Finish active terminal work before restarting the service. To remove AgentOnWeb:

```sh
aow uninstall
npm uninstall --global --prefix "$HOME/.local" @agentonweb/terminal-host
```

If you installed through npm directly, uninstall from your original npm prefix instead. User settings, CLI history and backups remain.

[Setup and troubleshooting](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/one-command-setup.md) · [Codex notifications](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/agent-notifications.md) · [Source development](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/development.md)
