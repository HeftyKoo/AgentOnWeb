# AgentOnWeb 0.3.0 release verification

Prepared on October 12, 2026. This feature release adds Claude Code hooks alongside
Codex, preserves active terminal input focus during extension updates, and makes
ANSI cell backgrounds follow Chill opacity. Extension, terminal host and DSH
package versions are 0.3.0; connector protocol remains 1. Safari uses build 8.

## Local validation

- `pnpm install --frozen-lockfile` passed without dependency changes.
- `pnpm release:audit` passed: 46 test files, 258 tests passed, one existing
  optional DSH test skipped.
- Privacy, architecture and TypeScript checks passed.
- Chrome MV3, Firefox MV2 and Safari MV2 builds/manifests passed; WebKit accepted
  the Safari manifest.
- Audited Chrome, terminal-host and DSH archives reproduced byte for byte.
- The terminal archive passed isolated production installation, installed
  bin-symlink Claude hook installation/uninstallation, lightweight reporter
  execution, authenticated browser assets and real shell input/output.
- The extension content suite includes focus-preservation regression coverage.
  It detects transient iframe hiding; JSDOM does not reproduce native browser
  focus loss itself.
- Safari preparation and the signed 0.3.0/build 8 Xcode archive passed. Preparation
  now creates the resource folder Xcode requires even when WXT inlines all assets.
  Export, upload, App Store processing and review remain separate checks.

The extension release workflow additionally packages Firefox and the exact
tracked source with `AMO-BUILD.md`, publishing checksums for all browser assets.

## Publication boundaries

This record confirms local source/package validation. CI, merge, npm publication,
GitHub release assets and individual browser-store results must be verified
independently. Store submission is distinct from approval/public availability.
Account-bound publication records and signed Safari artifacts belong in ignored
local directories.

Upgrading the package does not reload a running terminal host. Users finish live
terminal work, run `aow service uninstall`, then `aow setup`; review AgentOnWeb
hooks in their CLI's `/hooks` and start a new Codex or Claude Code session.
