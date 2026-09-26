# One-command setup (macOS + Chrome)

The extension and npm package must be released together. The Local terminal package and hosted installer have **not been published yet**. Existing store builds do not contain the new native bridge. These instructions describe the new release, not the old DSH-only store version.

## User flow

1. Install the updated AgentOnWeb Chrome extension and Node.js 22.19+; install/login to Codex separately if using Codex.
2. Run the published installer once. `scripts/install.sh` installs the package globally, then explicitly calls `aow setup`. Host and hooks configuration are automatic. Chrome checks every 30 seconds initially; failed native setup checks back off to at most 5 minutes. Manual pairing remains available immediately. No discovery picker or Allow connection page is required for a new installation.
3. In Codex, open `/hooks`, review the AgentOnWeb hooks, and trust them once. Launch a new Codex session inside an AgentOnWeb terminal.

The release installer URL must be deployed before advertising a `curl ... | sh` command. Until publication, developers can install a locally packed archive and run `aow setup`.

```sh
npm install -g @agentonweb/terminal-host
# Only needed when npm blocks lifecycle scripts, or to repair setup:
aow setup
```

Global npm installation invokes setup when lifecycle scripts are allowed. Newer npm policies or `--ignore-scripts` may block postinstall; therefore the shell installer is the recommended single entry point. It calls setup explicitly. Setup itself repairs the macOS PTY helper permissions, even when npm skipped all package lifecycle scripts. Local/workspace dependency installation does not configure the user's machine. `AOW_SKIP_SETUP=1` skips automatic global setup for packaging/CI.

On non-macOS platforms or under root, postinstall warns and skips automatic setup without failing installation for that reason. Native dependencies still need to install successfully. Use `aow terminal` for a foreground host on other platforms; Windows/Linux still require acceptance testing. On macOS, run `aow setup` as your own user, without sudo. Explicit `aow setup` still rejects unsupported platforms and root.

**Setup changes your Mac:** it adds AgentOnWeb hooks and notify forwarding to `~/.codex/hooks.json` and `config.toml` (or `CODEX_HOME`), registers the Chrome native messaging host, and installs/starts a per-user service that runs at login. Changed Codex files are backed up. To install the package without configuring these integrations, use `AOW_SKIP_SETUP=1 npm install -g @agentonweb/terminal-host`, then run `aow setup` when ready. If the notify configuration cannot be safely parsed, setup warns and leaves that file untouched while still installing hooks; completion notifications remain unavailable until repaired.

Setup checks the live service before reporting it ready. It reports Codex hook trust as a remaining user action, not as completed. It never selects a model, logs into Codex, changes its tool approval policy, writes hook-trust records, or enables the hook-trust bypass flag. Hook definitions that change may need a new review in Codex.

## Native pairing

The installed Chrome native messaging manifest permits only the official extension ID `lhbmeokjjcmklamnepcechnpcdjgkcoe`. Development builds require explicit enrollment:

```sh
aow setup --extension-id YOUR_UNPACKED_CHROME_EXTENSION_ID
```

The browser passes its caller origin to the native process. The helper verifies the installed allowlist and reads a per-run host secret from the user's private service directory. It can only probe or approve a pending connection for that caller origin at the host endpoint recorded by the service. Request JSON cannot override the caller, provide an arbitrary destination, or obtain the host's private tokens. Browser-origin HTTP requests and callers lacking the native secret are rejected.

Automatic pairing happens once per extension origin. A durable receipt survives reinstall/restart and revocation. Revoked connections and browser storage resets require the existing manual pairing flow; setup does not silently restore revoked access. Multiple Chrome profiles sharing the same extension ID also need manual pairing after the first profile.

## Updates and recovery

Repeat `aow setup` to repair service registration, native host paths, and Codex configuration. Unchanged Codex configuration is not rewritten or backed up again. Existing settings and notifications are preserved. Setup registers absolute Node/package paths; rerun after moving them.

Setup checks that its Node executable and CLI file are accessible before writing integrations. `nvm use` alone does not invalidate those paths: the previous Node installation keeps working while it exists. Removing that Node version (including its global npm packages), or moving the package, breaks the registered hooks, notify forwarder, native bridge and service at their next invocation. These integrations do not resolve a different Node/package automatically. Reinstall AgentOnWeb under the intended Node version and run `aow setup` before deleting the old installation. After finishing active terminal work, run `aow service uninstall` and `aow setup` to activate the new service paths immediately. If the old files were already removed, install with `AOW_SKIP_SETUP=1` first, then run those recovery commands. Service errors can be inspected in `~/.agentonweb/terminal/service.log`.

An older running host is not killed by setup. If it cannot support native pairing, setup exits with an explicit not-ready error. After finishing active terminal work, run `aow service uninstall` then `aow setup`. This restarts the host and terminates its prior shells. Browser grants and pairing receipts remain.

Native registration is at `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentonweb.terminal.json`; the private launcher/configuration is in `~/.agentonweb/terminal`.

## Uninstall

Finish active terminal work, then run these commands **before removing the npm package**:

```sh
aow uninstall
npm uninstall -g @agentonweb/terminal-host
```

`aow uninstall` removes AgentOnWeb hook groups, restores the previous notify command if its forwarder is still installed, removes Chrome/Chrome for Testing native registration and launcher files, and stops/removes the service. Stopping the service ends its live terminals. User settings, backups, CLI history, browser grants and pairing receipts remain. It does not restore an entire old config backup over later edits. Each cleanup step is attempted even if another fails: malformed `hooks.json` is left untouched while notify, native bridge and service cleanup still run. Failures are reported together with a nonzero exit; repair those files and rerun before removing the npm package. If npm was already removed, reinstall with `AOW_SKIP_SETUP=1` first, then run the commands above.

For partial removal, `aow codex-hooks uninstall` removes only Codex integration; `aow service uninstall` stops/removes only the service.

Firefox, Safari, Linux and Windows retain their existing support boundaries; this new automatic setup flow only targets macOS + Chrome.
