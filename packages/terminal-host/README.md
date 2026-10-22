# AgentOnWeb terminal for Codex, Claude Code and Pi

Run Codex, Claude Code or Pi in your browser, keep several project terminals open, and return to the right session when a task finishes or needs approval.

## Install on macOS

Install [the Chrome extension](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe), Node.js 22.19+ and your preferred CLI (Codex, Claude Code or Pi 1.1+), then run:

```sh
curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash
```

The installer configures the terminal service and Chrome connection. It detects `codex`, `claude` and `pi` executables on `PATH` and asks which notification integrations to install in a checkbox menu, including when run through `curl | bash`. Use Up/Down to move, Space to toggle, A to select/clear all, I to invert, and Enter to confirm. All detected CLIs start selected; clear all to configure the service only. Missing CLIs are always skipped. Open a website, click AgentOnWeb and run:

```sh
cd ~/your-project
codex
```

For notifications, review and trust **AgentOnWeb session status** in Codex `/hooks`, then start a new Codex session. Your existing Codex settings are preserved.

Use `aow setup` to choose integrations again, or pass `--agents codex,claude`, `--agents all` or `--agents none` to select them without prompting. `all` includes only detected CLIs; skipped integrations are left as they are. For unattended shell installation, append options with `| bash -s -- --agents all`. `aow setup --help` lists the options. Global npm installation without a terminal skips automatic setup and prints how to run it explicitly.

The installer configures zsh, bash and detected fish installations. It also links `aow` into Node's command directory when that directory is already on PATH and writable, so the current terminal can use it without sourcing a profile. If another program owns that command or the directory is protected, use `"$HOME/.local/bin/aow" service` directly.

For Claude Code, run `claude` in the same terminal. Setup installs observational hooks in `CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`). Review **AgentOnWeb session status** in Claude Code `/hooks`, then start a new session. To repair or remove only this integration, use `aow claude-hooks install` or `aow claude-hooks uninstall`. Models, permissions, other hooks and history are preserved.

For Pi 1.1+, run `pi` in the same terminal. Setup adds an observational extension at `PI_CODING_AGENT_DIR/extensions/agentonweb.ts` (default `~/.pi/agent/extensions/agentonweb.ts`). Start a new Pi process or use `/reload`. `aow pi-extension install` repairs it; `aow pi-extension uninstall` removes it, followed by `/reload` to unload it. Settings, models, other extensions and history are preserved. Blocking extension dialogs request attention; completed notifications wait for all automatic work to settle. No hook trust step is needed for Pi.

## Terminal controls

- **+** opens another independent local shell (up to eight). The selector switches between shells without stopping their processes.
- **×** appears on tab hover or keyboard focus and closes that shell and its running process after an in-page confirmation. Cancel or Escape leaves it running. Typing `exit` ends that shell normally; **+** opens a new one.
- Every connected view of the same terminal can type and paste immediately; input reaches the same shell and output is synchronized across views. Only the focused view controls terminal dimensions. Background views cannot resize the shell, and no manual takeover is needed.
- Drag with the mouse or trackpad to select terminal text, even while a TUI captures the mouse; right-click the selection and choose **Copy**. Double-click selects a word. You can also copy with **Command+C** on macOS or **Ctrl+Shift+C** on Windows/Linux. Single clicks and scrolling keep working in the TUI.
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
aow service restart    # Reload installed code after exiting or closing terminals
aow service uninstall  # Stop the service and remove automatic startup
```

Uninstalling stops its live terminals but does not delete saved CLI history. The service is installed only for your macOS user. It uses `~/Library/LaunchAgents/com.agentonweb.terminal.plist`; diagnostics are at `~/.agentonweb/terminal/service.log`. Keep the installed Node and package paths available; reinstall the service after moving/removing them. Re-running install while loaded updates the next-login configuration without interrupting live terminals. New host code takes effect after the host restarts. Run `aow service restart` in a separate macOS Terminal after exiting or closing every live shell. It refuses while any shell is alive, including an idle shell; `--force` explicitly ends their tasks. Restart waits for the old process to exit and verifies the new process's version. Browser grants and CLI history remain.

## Version checks and upgrades

```sh
aow --version                    # Installed CLI version
aow service status               # Installed CLI and running host versions
aow check-update                 # Query the latest stable npm version now
aow check-update --disable       # Persistently disable automatic checks
aow check-update --enable        # Re-enable automatic checks
aow update                       # Install a newer version and restart safely
```

The host checks npm asynchronously after startup, caches successful checks for 24 hours, and retries failed checks with increasing delays. Automatic requests time out after three seconds. Explicit `check-update` and `update` requests allow 15 seconds each and retry a transient network failure, HTTP 429 or server error once. Automatic checks only query public package metadata; they never download/install packages or restart the service. They are disabled in CI and when `AOW_UPDATE_CHECK=0` is set in the host environment. Explicit `check-update` and `update` still query npm when automatic checks are disabled. The private management page and service log show available updates; the page also identifies a newer installed version waiting for restart.

Run `aow update` from a separate macOS Terminal, outside AgentOnWeb. It supports global npm installations, retains the original installation prefix and Node executable, and installs the exact stable version it checked. Development checkouts, npx and other package-manager layouts must be updated through their original workflow. It never downgrades to an older `latest` or selects a prerelease. An incompatible Node requirement stops the update before installation. Active terminals block installation/restart unless you explicitly pass `--force`; hosts with update support pause new terminal creation during maintenance. An npm failure does not restart the service. If installation succeeds but restart fails, inspect `service.log` and run `aow setup` to repair the service.

Installing a newer CLI does not replace an older running host. A host from 0.4.0 or earlier has no maintenance interface and can return HTTP 401 to a new CLI. After finishing terminal work, an updated CLI can use `aow service restart --force` to reload installed code, or `aow update --force` to upgrade and restart. Explicit `aow update --force` also reinstalls and restarts when the CLI already matches npm's stable version; it never downgrades. The CLI verifies that the older host PID belongs to the macOS service before proceeding and rechecks it before stopping anything. Older hosts cannot pause or count terminals; explicit force ends all their terminal tasks. Foreground hosts must be stopped manually. Authorization errors from hosts with update support are not bypassed. If the installed CLI lacks this recovery support, run `aow service uninstall`, then rerun the installer.

Update skips automatic setup so it preserves chosen CLI integrations, enrolled unpacked extension IDs, pairing and shell profiles. The existing integrations keep referring to the same package paths. Without a running service, update installs the package and leaves service setup to you. Old hosts without the maintenance interface require finishing terminal work, stopping them manually and rerunning the installer once to acquire these commands. Versioned release installers remain pinned. Browser extensions and DSH plugins follow their own release/update paths.

Only one host may use a state directory. A dead PID is recovered automatically, with lock updates serialized through `host.pid.guard`. If `host.pid` is invalid or an interrupted update leaves `host.pid.guard`, the startup error identifies the affected path. Confirm that no host is running or starting for that directory before removing the reported file or empty guard directory. Do not remove a live host's lock.

Automatic installation currently supports macOS. On other platforms, or when you want a foreground host, use `aow terminal`. Keep that host process running and approve through its printed private setup link. Windows/Linux and live Firefox/Safari have not been acceptance-tested.

## Repair and uninstall

Run `aow setup` to repair configuration. Finish active terminal work before restarting the service. To remove AgentOnWeb:

```sh
aow uninstall
npm uninstall --global --prefix "$HOME/.local" @agentonweb/terminal-host
```

If you installed through npm directly, uninstall from your original npm prefix instead. User settings, CLI history and backups remain.

[Setup and troubleshooting](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/one-command-setup.md) · [Agent notifications](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/agent-notifications.md) · [Source development](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/development.md)

The human-facing CLI uses a compact Matrix-inspired green theme, grouped help and status labels. Run `aow --help` (or `aow help`) and `aow <command> --help` for details. Help adapts to terminal width; redirected output is plain text. Set `NO_COLOR=1` to disable color.
