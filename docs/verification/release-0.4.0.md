# AgentOnWeb 0.4.0 release verification

Prepared on October 13, 2026. Extension, terminal host and DSH package versions
are 0.4.0; connector protocol remains 1. Safari uses marketing version 0.4.0,
build 9.

This release includes Pi session integration, installed-CLI setup selection,
runtime reconnection and browser-tab state isolation. Terminal input forwards
enabled default mode shortcuts through authenticated frame messages. Explicit
Focus actions focus the terminal, Chill preserves focus, and Watch restores
website input. See [terminal mode regression evidence](terminal-mode-focus-2026-10-13.md).

## Local validation

- `pnpm install --frozen-lockfile` passed without dependency changes.
- `pnpm release:audit` passed: 52 test files, 326 tests passed, one existing
  optional installed-DSH bridge test skipped.
- Privacy, architecture and TypeScript checks passed.
- Chrome MV3, Firefox MV2 and Safari MV2 builds/manifests passed; WebKit accepted
  the Safari manifest.
- Audited extension, terminal-host and DSH archives reproduced byte for byte.
- The terminal archive passed isolated production installation, Claude/Pi
  integration installation/uninstallation, lightweight reporters, authenticated
  browser assets and real shell input/output.
- The current terminal focus implementation passed visible Chrome verification
  with a real shell and rapid keyboard-only mode changes before release prep.

## Publication boundaries

CI, PR merge, npm publication, GitHub release assets and each browser-market
submission or public status are verified separately. Signed Safari artifacts
and account-bound publication records stay in ignored local directories.

Update both the extension and terminal host for the shortcut/focus changes.
Package installation does not reload an already running host: finish live
terminal work, run `aow service uninstall`, then rerun the installer or
`aow setup`. Restart DSH separately after updating its plugin.
