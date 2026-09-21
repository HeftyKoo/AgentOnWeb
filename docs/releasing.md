# Release AgentOnWeb

The workspace builds three independently versioned artifacts. Their names and versions are recorded in `release-contract.json`:

| Artifact | Version field | Package | Delivery |
| --- | --- | --- | --- |
| Chrome extension ZIP | `extensionVersion` | `apps/extension` | `ext-v…` release tag, then explicit store upload |
| DSH plugin TGZ | `pluginVersion` | `@agentonweb/dsh-surface` | `dsh-v…` release tag and npm |
| Local terminal host TGZ | `terminalHostVersion` | `@agentonweb/terminal-host` | Local installation; no npm publishing workflow yet |

The terminal host launches a general-purpose shell. Do not describe the source terminal feature as already available from the published extension or npm.

Change only the affected artifact's version in the contract, matching package manifest and artifact name. Cross-artifact compatibility is carried by `connectorProtocol`, not matching release numbers. The contract's `dsh` field is the DSH compatibility baseline; it does not constrain the terminal host.

## Build and audit

```sh
pnpm release:audit
```

The audit runs `pnpm check` (privacy, architecture, TypeScript, tests, workspace builds and Chrome/Firefox/Safari manifest checks). It then packs the extension, DSH plugin and terminal host, repeats the builds to verify byte-for-byte reproducibility, verifies archive contents and packed guides, and writes `release/SHA256SUMS` for all three artifacts.

The DSH plugin is imported outside the workspace. The terminal archive is installed in a temporary directory with production dependencies and install scripts, then its `aow --help`, authenticated HTML/JS/CSS and a real shell round trip are checked with a temporary home directory. This requires npm registry access and a working `node-pty` installation for the audit machine. It never installs or restarts the user's background service.

The DSH package contains prebuilt `lib/` output and needs no install-time build. The terminal package also contains prebuilt host/UI assets, but `node-pty` is a native dependency and its platform installation must succeed. Automatic service installation and live terminal acceptance currently cover macOS only; live browser acceptance covers Chrome.

## Published artifact workflows

- `ext-v<extensionVersion>` attaches the audited extension ZIP and checksum to a GitHub release.
- `dsh-v<pluginVersion>` publishes the DSH plugin to npm (requires `NPM_TOKEN`) and attaches the TGZ and checksum to a GitHub release.

Both workflows run the complete audit. They do not publish the terminal host. Chrome Web Store upload is an explicit action using the audited ZIP. Store review/publication is separate from a GitHub release. Firefox signing and Safari containing-app packaging are separate from this Chrome artifact.

Users install the DSH integration with `dsh plugin --profile web add @agentonweb/dsh-surface@<pluginVersion>` and restart `dsh web`.

## Local terminal installation and updates

After auditing, install the terminal TGZ listed in the contract:

```sh
npm install -g ./release/agentonweb-terminal-host-0.1.0.tgz
aow service install
```

Load the source-built extension as described in the root README. Do not assume an earlier store extension supports the new runtime flow.

Installing over a running service updates files and its next-login configuration; it does not reload host code into the existing process. To use a new host build immediately, finish your shell work, run `aow service uninstall`, then `aow service install`. Uninstalling stops live terminal processes; saved CLI history and browser grants remain. No automatic restart is performed during an audit.

Before adding terminal-host publishing or widening platform support, verify the intended installation, pairing, shell input, reconnect and revocation workflows on those platforms. The current version fields and local artifact are not evidence of an npm release.
