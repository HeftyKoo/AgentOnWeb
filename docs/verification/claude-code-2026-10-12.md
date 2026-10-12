# Claude Code support review — 2026-10-12

Reviewed the pending Claude Code implementation against the native-terminal contract, existing repository standards, and the official Claude Code hooks/settings documentation. Separate standards and functional reviews found two blocking defects; both are fixed and have regression coverage. No unresolved blocker remains in either review.

## Corrections

- A blocking Stop hook can resume work within the same `prompt_id`. Turn-wide completion deduplication discarded the final Stop after that resumed work. Claude completion/interruption now follows current session state, while consecutive duplicate completions preserve their notification identity. The regression covers a continued prompt, its final completion and repeated interruptions.
- npm exposes `aow` through a bin symlink. Resolving the reporter from `argv[1]` selected the bin directory instead of the package. The reporter now resolves relative to the actual bundled module URL. Package acceptance installs/uninstalls hooks through `node_modules/.bin/aow`, compares canonical reporter paths and executes the generated command/arguments.
- The real-host Claude event fixture now supplies the official `prompt_id`, exercising turn correlation through the packaged reporter.

## Validation

Validation ran in an isolated worktree incorporating the current `origin/main` installer/service fixes. The pending Chill rendering changes and pre-existing local Vitest/installer edits were excluded from this review commit.

```sh
pnpm check:privacy
pnpm check:architecture
pnpm typecheck
pnpm --filter @agentonweb/dsh-surface build
pnpm --filter @agentonweb/terminal-host build
pnpm exec vitest run --maxWorkers=4
pnpm build
pnpm build:extension:firefox
pnpm build:extension:safari
node scripts/check-extension-builds.mjs
pnpm check:extension:safari-native
node scripts/release-audit.mjs
```

- 45 test files passed: **256 tests passed, 1 existing optional DSH test skipped**.
- Privacy, architecture, TypeScript, Chrome/Firefox/Safari builds/manifests and Safari WKWebExtension validation passed.
- Real PTY/host transport tests delivered both Codex and Claude running/approval/completion states without an open terminal viewer and restored reconnect snapshots.
- The release audit passed reproducible artifacts, isolated production package installation, installed bin-symlink hook preservation/idempotence/uninstall, lightweight reporter execution, browser assets and real shell I/O.
- The first package-path assertion exposed macOS `/var` versus `/private/var` canonicalization; the assertion now compares real paths and the generated reporter command executes successfully.

## Boundaries

This establishes source and package readiness. It does not publish an npm package, update browser stores, merge to main, or restart the user's installed service. Current package/installer versions remain the existing 0.2.1 contract until a separately authorized release.

Native Claude Code UI acceptance remains the dated [2026-10-02 record](claude-code-2026-10-02.md); this review reran host/PTY and isolated-package acceptance rather than a new live Claude UI session. Unsignalled cancellation/denial can leave approximate status until another supported event; this documented upstream-hook limitation remains unchanged.

Sources: [official hooks](https://code.claude.com/docs/en/hooks), [official settings](https://code.claude.com/docs/en/settings), [event mapping](../agent-notifications.md).
