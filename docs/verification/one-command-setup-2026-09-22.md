# One-command setup verification — 2026-09-22

Branch: `support-cli`. No commit, push, npm publication or hosted installer deployment.

## Implemented

- `aow setup`: validates supported platform/arguments, fixes macOS PTY helper permissions independently of npm scripts, preserves and installs Codex hooks/notify, registers the Chrome native host, configures LaunchAgent and checks the live host before reporting ready.
- Global-only npm postinstall and an explicit shell installer (`scripts/install.sh`). Workspace installs do not run setup. The shell installer remains effective when npm blocks package lifecycle scripts.
- Native Messaging first pairing, browser background discovery/retry, caller-bound pending authorization, persisted pairing receipts, and no automatic regrant after revocation.
- Official extension ID by default; unpacked IDs require explicit `--extension-id` enrollment. No hook trust bypass or trust-database writes.

## Automated and packaged verification

- Full `pnpm release:audit` passed: privacy/architecture checks, TypeScript, 175 passing tests and 1 existing skip across 37 files, Chrome/Firefox/Safari builds, Safari native validation, reproducible release packages and isolated installed-host real shell input/output.
- Native bridge tests include byte-fragmented protocol frames, size/truncation rejection, explicit origin allowlists, executable launcher quoting and repeat registration.
- Real host integration runs the packaged native-host stdio command and authenticates a connector without the approval UI. Web-origin/missing-secret calls and wrong endpoints fail. Revocation survives subsequent probes.
- Installer test checks paths with spaces and proves failed npm installation never proceeds to setup.
- Installed a packed archive into `output/setup-acceptance/installed`. The installed `aow setup` detected the prior running host as not ready and did not terminate its sessions. After an explicit service restart, setup completed with a healthy local endpoint.
- The local npm installation blocked unapproved lifecycle scripts. Explicit setup still succeeded, including PTY permissions, confirming the shell-installer path is needed for these npm policies.
- Repeated live setup preserved identical hashes for hooks/config and created zero additional backups. The test origin retained exactly one grant.

## Computer acceptance

The primary Chrome was being operated by another task. The user could not pause it, so remaining acceptance used an independent official Chrome for Testing 153.0.8010.52 application/profile, controlled through Computer (no CDP/Playwright browser automation).

- Loaded a fresh unpacked extension identity `dddhalbfeingimgdajlhhiidaidhhpdm`, with no prior credential/grant.
- The real browser exposed a native-host registration issue: its profile directory is `Google/Chrome for Testing`, including spaces. Fixed registration accordingly and added a regression assertion.
- After setup, the extension's normal retry cycle connected automatically on `https://example.com/?aow-setup-acceptance=1`. No discovery picker or Allow connection page was used.
- The real page displayed the native terminal from `localhost:53901`. Typed `printf 'AOW_NATIVE_SETUP_OK\n'; pwd` through Computer; visible output contained the marker and working directory.
- Page refresh retained the connected terminal. Repeated setup retained the grant without a duplicate.

## Boundaries

Codex first-use hook review remains a user action. After explicit user authorization, completed it through the native UI; real approval, denial, interruption and concurrent-session acceptance is recorded in [notification verification](agent-notifications-2026-09-22.md). Public npm and curl URLs are not live. macOS + Chrome is the automatic setup scope; other browser/platform behavior is not claimed from this test.

The primary Chrome AgentOnWeb extension was temporarily disabled during the initial isolated-load attempt. Its window was subsequently controlled by another task; after the user said that task could not pause, no primary-browser restoration was attempted. After the user subsequently authorized browser takeover, re-enabled and reloaded the original extension in the main Chrome profile. Its existing authorization reconnected automatically to localhost:53901. A new real page at https://example.com/?aow-main-acceptance=1 executed and displayed AOW_MAIN_CHROME_OK. Main Chrome is restored; the independent Chrome for Testing extension remains enabled and connected.

The main-Chrome follow-up launched Codex 0.155.1 with `-s read-only -a on-request`. Codex presented its first-use review for seven untrusted hooks. Inspected the exact local Node / repository `lib/cli.js agent-event` command in the native UI; execution trust was subsequently granted after explicit user confirmation, with all seven hooks showing Active.
