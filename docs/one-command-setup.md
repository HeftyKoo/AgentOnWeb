# Set up AgentOnWeb for Codex, Claude Code and Pi

Use **macOS + Chrome**, with Node.js 22.19+ and Codex, Claude Code or Pi 1.1+ installed and signed in.

1. Install [AgentOnWeb from the Chrome Web Store](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe).
2. Run this command in your Mac's Terminal:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash
   ```

3. Open a website, click AgentOnWeb and run `codex`, `claude` or `pi` in its terminal.
4. For session notifications, open Codex `/hooks`, review and trust **AgentOnWeb session status**, then start a new Codex session.

The installer configures your terminal service, automatic startup and Chrome connection. It detects `codex`, `claude` and `pi` executables on your current `PATH`, then asks which detected CLIs should receive notification hooks or an extension. It installs the terminal package under `~/.local`, adds its command directory to your shell profile, and preserves existing CLI settings with backups. Run it as your own user, without sudo.

The command works from zsh, bash and fish. The installer configures both login and interactive zsh/bash windows, including editor terminals, and uses fish's own PATH syntax when fish is installed or selected as your login shell. It respects exported `ZDOTDIR` and `XDG_CONFIG_HOME` settings and preserves the Bash login profile you already use.

For an already-open terminal, the installer also creates a link to the installed `aow` beside Node when that directory is writable and already on PATH, as in typical nvm/Homebrew installations. This makes `aow` available immediately without `source`. Existing npm links from older AgentOnWeb packages are updated; unrelated commands are preserved.

## Choose CLI integrations

By default, both the installer and `aow setup` show a checkbox menu for the detected CLIs. All detected CLIs start selected. Use **Up/Down** to move, **Space** to toggle a checkbox, **A** to select/clear all, **I** to invert, and **Enter** to confirm. Clear all checkboxes to configure only the terminal service. The installer reads the choice from your terminal even when run through `curl | bash`. Cancel with Control+C or Esc before integration/service configuration starts.

To choose explicitly without an interactive menu:

```sh
aow setup --agents codex,claude  # Only these CLIs, if installed
aow setup --agents all          # All detected CLIs
aow setup --agents none         # Terminal service and Chrome connection only
aow setup --help
```

Pass the same options through the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash -s -- --agents codex,pi
```

Missing CLIs are always skipped, including with `--agents all`. Saved CLI settings, shell aliases and a desktop app alone do not count as an executable CLI on `PATH`. Add an installed CLI to `PATH`, then rerun setup to include it. Skipping a CLI preserves any existing integration; use its separate uninstall command to remove it.

Unattended setup requires an explicit `--agents` choice when CLIs are detected. A global npm installation without a controlling terminal leaves the package installed and skips automatic setup; run `aow setup` in a terminal or use `--agents` afterward.

## The workspace has not appeared

On a first installation, Chrome connects automatically. Wait briefly and refresh your website. If Chrome previously tried to connect before setup, its next check can take up to five minutes.

If you previously revoked access or cleared browser data, open AgentOnWeb, choose Local terminal and connect again. Run `aow service` (or `aow service open`) to open the private approval page. Additional Chrome profiles also use this manual connection flow. `aow service --help` lists the service actions.

Check the service with:

```sh
aow service status
```

To repair configuration, run `aow setup`. If Node's command directory is protected or contains an unrelated `aow`, the installer cannot add its convenience link. Use the installed command directly in that window:

```sh
"$HOME/.local/bin/aow" service
```

To enable `aow` in the same zsh/bash window, run `export PATH="$HOME/.local/bin:$PATH"`. In fish, run `fish_add_path --path --move "$HOME/.local/bin"`. If setup fails after package installation, the command's PATH configuration is retained and the installer prints `"$HOME/.local/bin/aow" setup` to retry directly. If the direct command also reports that the file does not exist, installation did not create the expected CLI; check the installer's error output before retrying.

## Codex notifications are missing

Review the hooks in Codex `/hooks`, then start a new Codex session inside AgentOnWeb. Existing sessions do not pick up newly installed hooks. If you use a custom `CODEX_HOME`, run setup with the same environment. Configuration errors are reported by setup; correct the file and run `aow setup` again.

Notifications link back to the relevant terminal. Approval decisions stay in Codex. See [notification details](agent-notifications.md).

## Claude Code notifications are missing

Run `aow claude-hooks install`, review **AgentOnWeb session status** in Claude Code `/hooks`, then start a new session inside AgentOnWeb. Use the same `CLAUDE_CONFIG_DIR` as your CLI. The installer backs up `settings.json` and preserves existing hooks, models, permissions and `disableAllHooks`; disabled or policy-restricted hooks remain disabled. Approval decisions stay in Claude Code.

## Pi notifications are missing

Run `aow pi-extension install`, then start Pi 1.1+ in an AgentOnWeb terminal or run `/reload` in Pi. Use the same `PI_CODING_AGENT_DIR` as your CLI (default `~/.pi/agent`). Check that `extensions/agentonweb.ts` is enabled; `--no-extensions` and excluded resources prevent automatic loading. The extension leaves settings and other extensions intact and stays inactive outside host-owned terminals. Pi's native confirmation and input dialogs stay in the terminal.

## Update or repair

The host automatically checks the stable npm version at most once a day and displays updates in its private management page and service log. Checks do not install code or restart your terminals. Run these commands in a separate macOS Terminal:

```sh
aow --version
aow service status
aow check-update
aow update
aow service restart
```

`aow update` retains the existing global npm prefix, installs the checked stable version, and restarts a running macOS service. Exit or close every terminal first; an idle live shell also blocks maintenance. `aow service restart` reloads already-installed code without reinstalling the package. Both commands reject execution inside an AgentOnWeb terminal; use your Mac's Terminal app. `--force` explicitly permits ending all live shells and their tasks; `aow update --force` also reinstalls and restarts when the installed CLI is already the current stable version, without downgrading. Restart confirms the new process and version before reporting success. Saved CLI history, browser grants, selected integrations and enrolled extension IDs remain.

Use `aow check-update --disable` to persistently turn automatic checks off, and `--enable` to restore them. Setting `AOW_UPDATE_CHECK=0` in the host environment also disables them; CI skips automatic checks. Explicit checks and upgrades still work. A network failure leaves terminals running; automatic checks retain cached results and retry with increasing delays. Explicit checks never install from stale metadata after a failed query: they allow 15 seconds per request and retry transient failures once. Automatic requests query only npm package metadata, with a three-second timeout. See the [privacy policy](store-site/privacy.md).

The installed CLI and running host can have different versions. If a newer CLI finds a running host from 0.4.0 or earlier without a maintenance interface, finish terminal work, then use `aow service restart --force` to load installed code or `aow update --force` to upgrade. This recovery requires an updated CLI and verifies that the old host PID belongs to the macOS service; it ends all service terminal tasks because the old host cannot pause or count them. A foreground `aow terminal` must be stopped manually. If the installed CLI lacks recovery support, run `aow service uninstall`, then rerun the installation command once. The installer remains version-pinned and repairs configuration. Development/npx/other package-manager installations require their original upgrade workflow. If you move or remove Node, rerun the installer under the Node version you intend to keep. npm failure does not trigger a service restart; if the package installed but the service is not ready, inspect `~/.agentonweb/terminal/service.log` and run `aow setup`.

## Uninstall

Finish your terminal work, then run:

```sh
aow uninstall
npm uninstall --global --prefix "$HOME/.local" @agentonweb/terminal-host
```

This stops the terminal service, removes Chrome pairing registration and AgentOnWeb hooks, and restores your previous Codex notify command. User settings, history and backups remain. If you installed through npm directly instead of the shell installer, uninstall from the npm prefix you originally used.

If cleanup reports an error, correct it and rerun `aow uninstall` before removing the package. To remove only notifications, use `aow codex-hooks uninstall`, `aow claude-hooks uninstall` or `aow pi-extension uninstall`. Use `/reload` in Pi to unload the removed extension.

[Back to AgentOnWeb](../README.md) · [Development setup](development.md)
