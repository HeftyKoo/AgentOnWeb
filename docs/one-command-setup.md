# Set up AgentOnWeb for Codex

Use **macOS + Chrome**, with Node.js 22.19+ and Codex installed and signed in.

1. Install [AgentOnWeb from the Chrome Web Store](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe).
2. Run this command in your Mac's Terminal:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash
   ```

3. Open a website, click AgentOnWeb and run `codex` in its terminal.
4. For session notifications, open Codex `/hooks`, review and trust **AgentOnWeb session status**, then start a new Codex session.

The installer configures your terminal service, automatic startup, Chrome connection and Codex notifications. It installs the terminal package under `~/.local`, adds its command directory to your shell profile, and preserves existing Codex settings with backups. Run it as your own user, without sudo.

The command works from zsh, bash and fish. The installer configures both login and interactive zsh/bash windows, including editor terminals, and uses fish's own PATH syntax when fish is installed or selected as your login shell. It respects exported `ZDOTDIR` and `XDG_CONFIG_HOME` settings and preserves the Bash login profile you already use.

For an already-open terminal, the installer also creates a link to the installed `aow` beside Node when that directory is writable and already on PATH, as in typical nvm/Homebrew installations. This makes `aow` available immediately without `source`. Existing npm links from older AgentOnWeb packages are updated; unrelated commands are preserved.

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

## Update or repair

Rerun the installation command to install the current AgentOnWeb terminal package and repair its configuration. Installation leaves active terminal sessions running. To load an updated service, finish your work, then run:

```sh
aow service uninstall
aow setup
```

Stopping the service ends its live shells. Your saved CLI history and browser connections remain. If you move or remove the Node.js installation used by AgentOnWeb, rerun the installer under the Node version you intend to keep, then restart the service as above.

## Uninstall

Finish your terminal work, then run:

```sh
aow uninstall
npm uninstall --global --prefix "$HOME/.local" @agentonweb/terminal-host
```

This stops the terminal service, removes Chrome pairing registration and AgentOnWeb hooks, and restores your previous Codex notify command. User settings, history and backups remain. If you installed through npm directly instead of the shell installer, uninstall from the npm prefix you originally used.

If cleanup reports an error, correct it and rerun `aow uninstall` before removing the package. To remove only notifications, use `aow codex-hooks uninstall`.

[Back to AgentOnWeb](../README.md) · [Development setup](development.md)
