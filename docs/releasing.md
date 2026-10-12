# Release AgentOnWeb

## Terminal host 0.2.1 patch

This patch fixes immediate command discovery after shell installation and makes `aow service` default to opening the connection page. Publish `terminal-v0.2.1` from the reviewed main commit after both CI jobs pass. The extension and DSH plugin remain at 0.2.0; the connector protocol remains 1.

## 0.2.0 scope

This release introduces Local terminal, shared terminal views, directory-based tab names and renaming, independent Terminal/DSH connections, Codex session activity and page notifications, and macOS + Chrome setup. It also includes the main branch's DSH stale-cookie authentication fix. See [CHANGELOG](../CHANGELOG.md).

The extension, DSH plugin and terminal host all start this release at **0.2.0**. Safari targets use marketing version **0.2.0**, build **6**. Future artifact versions may diverge; `release-contract.json` records their names and versions. The connector protocol remains **1**, and the DSH version verified for this release is **0.1.7-rc.2** (npm latest on September 29, 2026). User installation follows `@latest`; rerun compatibility acceptance when upstream changes.

| Artifact | Version field | Delivery |
| --- | --- | --- |
| Chrome extension ZIP | `extensionVersion` | `ext-v0.2.0`, then explicit store submission |
| DSH plugin TGZ | `pluginVersion` | `dsh-v0.2.0`, npm + GitHub release |
| Terminal host TGZ + installer | `terminalHostVersion` | `terminal-v0.2.1`, npm + GitHub release |

A merged branch or GitHub release does not mean a browser store has approved the update. Live terminal acceptance currently covers macOS/Chrome. Firefox/Safari builds and Linux CI do not establish live terminal support on those platforms. Automatic setup targets macOS + Chrome only.

## Build and audit

```sh
pnpm install --frozen-lockfile
pnpm release:audit
pnpm prepare:safari
```

The audit runs privacy/architecture checks, TypeScript, tests and Chrome/Firefox/Safari builds. On macOS it also validates the generated Safari manifest through WebKit. It checks package/contract/Safari version consistency, verifies byte-for-byte reproducibility of extension and npm archives, checks packed documentation and assets, and writes `release/SHA256SUMS`, including the version-pinned `install.sh`.

The DSH plugin is imported outside the workspace. The terminal archive is installed in a temporary directory with production dependencies and install scripts, then tested through `aow --help`, authenticated browser assets and a real shell round trip with a temporary home. This needs registry access and a working native `node-pty` dependency. It does not install or restart the user's service.

`prepare:safari` additionally builds the offline demo and syncs resources into the Xcode project. Follow the [Safari guide](../apps/safari/README.md) for signing, archive/export and store review. Firefox requires its own MV2 package and AMO signing; never upload the Chrome MV3 ZIP to Firefox or Safari.

## Merge and publication checklist

- Integrate the latest default branch (`main` in this repository), resolve conflicts, and pass the complete audit on the final commit. Do not omit the DSH cookie fix while merging the multi-runtime code.
- Review both READMEs, package guides, setup/upgrade/uninstall instructions, public support/privacy copy and changelog against the shipped behavior.
- On macOS + Chrome, verify a clean installation, native/manual pairing, shell input, multiple views, Terminal/DSH switching, refresh/reconnect, revocation, upgrade and uninstall. Review/trust Codex hooks in Codex and verify real completion/approval notifications. Do not replace these with simulated preview events.
- Confirm the npm publishing credential (`NPM_TOKEN`) has access to the selected public package, and check that its version is unused before creating immutable release tags. Never log the token.
- Publish from the reviewed commit on `main`: DSH and terminal npm releases first, then the extension release and store submissions. Each tag workflow reruns the full audit and checks its version before publishing.
- Verify npm versions and GitHub checksums/downloads. Smoke-test the published installer and matching extension on a clean user environment before advertising them.
- Deploy `docs/store-site/` to the existing `gh-pages` publication workflow/process, then check the rendered support/privacy URLs. Committing these files alone does not update that site.
- Check each store's processed version and final review/publication state independently. Update availability wording only after confirmation.

The root READMEs are user-facing: keep release readiness, platform acceptance evidence and source-build instructions in this guide or `docs/development.md`. The public quick start must use the store extension and shell installer.

## Latest DSH compatibility

The `dsh-latest` CI job installs `@deepseek-ai/dsh@latest`, builds the actual plugin archive, checks its HTTP bridge and native settings page, and runs the stale-cookie iframe/API/WebSocket regression in Chromium. Both `verify` and `dsh-latest` must pass before merging or tagging. See the [0.2.0 verification record](verification/release-0.2.0.md) for local reproduction commands.

## Tag workflows

`.github/workflows/release.yml` accepts `ext-v*`, `dsh-v*` and `terminal-v*`. npm publication uses the exact audited TGZ with lifecycle scripts disabled, so it cannot rebuild different bytes during publication. The terminal GitHub release includes its TGZ, `install.sh` and checksums. Publication needs `NPM_TOKEN`; workflow setup never configures a user service.

After the relevant release is public, users can run:

```sh
npm install -g @agentonweb/terminal-host@0.2.1
# Repair setup or run it explicitly when lifecycle scripts were blocked:
aow setup
```

The release installer at `https://github.com/HeftyKoo/AgentOnWeb/releases/download/terminal-v0.2.1/install.sh` pins the package to 0.2.1 and explicitly calls setup. The user-facing command downloads `https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh`. Both that script and its pinned npm package must be live before announcing the installation flow. The installer uses the user-owned `~/.local` npm prefix, configures zsh/bash/fish startup paths, and links `aow` beside Node when that directory is writable and already on PATH. Existing AgentOnWeb npm links are updated; unrelated commands are preserved. The versioned release URL is a publication target, not proof that the asset exists. Download and inspect it before running it; do not advertise it until the release and clean-install test succeed.

## Local installation and upgrades

Before publishing, use the audited archive with the source-built extension:

```sh
AOW_SKIP_SETUP=1 npm install -g ./release/agentonweb-terminal-host-0.2.1.tgz
aow setup --extension-id YOUR_UNPACKED_CHROME_EXTENSION_ID
```

For manual pairing without Chrome/Codex integration, use `aow service install` and the private setup page instead. Setup registers absolute Node/package paths; rerun it when paths change. The official native host allowlist includes the official Chrome extension ID; unpacked IDs must be enrolled explicitly.

Installing over a running service does not reload its code. Finish active shell work, run `aow service uninstall`, then `aow setup` (include the unpacked ID when needed) to activate the installed version. Stopping the service ends live shells; saved CLI history, browser grants and pairing receipts remain. Restart `dsh web` separately after updating its plugin.

To remove integrations, run `aow uninstall` **before** `npm uninstall -g @agentonweb/terminal-host`. This stops service terminals, removes native registration and AgentOnWeb hooks, and restores the previous notify command while preserving user settings/history/backups. See [setup and recovery](one-command-setup.md).
