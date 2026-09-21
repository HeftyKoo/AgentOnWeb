# Local-shell implementation review — 2026-09-20

Scope: the uncommitted local-shell implementation and documentation, reviewed against HEAD without discarding existing work. Standards and specification were reviewed independently; real browser acceptance then exercised the resulting changes. The product contract is a host-owned interactive shell displayed in the browser, with DSH independently connected. AgentOnWeb does not mirror an existing Terminal.app window or implement a tool-specific agent runtime.

## Implementation corrections

- Preserved binary terminal input as bytes, separately from UTF-8 text. The real PTY regression verifies that a legacy mouse-report byte `80` stays `80`, rather than becoming `c280`.
- Split large pastes into ordered, bounded frames without splitting surrogate pairs or bracketed-paste markers. Prevented delayed terminal lists and output ACK callbacks from affecting a newly selected session.
- Kept exited terminals read-only and rejected attempts to take control after process exit. Verified shell and foreground-child cleanup with a real process regression.
- Fixed replacement iframe initialization after reconnect. Presentation messages are buffered until the native iframe loads, including messages arriving while background authorization is pending; the native URL is still loaded only after authorization succeeds.
- Preserved Safari administrator cookies on a runtime's native top-level page by omitting/removing delegated Cookie header rules there, including in-flight rules. Embedded views retain delegated authorization.
- On revocation, reconnect remaining authorized connector transports to obtain the rotated terminal credential; revoked grants remain rejected and host-owned shells continue.
- Served the setup document directly after a valid one-time `/launch` request. An immediate redirect from a cross-site launch could withhold the Strict cookie and show the login page. The document clears the consumed token from browser history.
- Suppressed the overlay on all discovered/connected native management origins, including an unpaired runtime while another runtime is selected. This prevents a DSH overlay from covering terminal setup. Ordinary localhost applications remain eligible.
- Removed disconnected, uncredentialed runtime entries once discovery no longer finds them. Valid connections and remembered reconnect credentials are retained. Old transport callbacks cannot resurrect a removed instance or overwrite a later instance with the same ID. Stale per-tab selections return to an existing connection or a clear selection screen without silently requesting new authorization.
- Updated macOS service installation to refresh next-login configuration without interrupting live terminals. Immediate updates remain an explicit stop/start operation.

The setup-cookie, native-management-page and delayed-presentation issues were reproduced through Computer in real Chrome before being fixed. The updated behavior was then checked through the same UI. Test cleanup also exposed the stale-runtime problem; regressions cover pruning and selection, and the final browser check confirms the temporary entry is gone. See [browser acceptance](local-shell-2026-09-20.md).

## Code and documentation cleanup

Removed the obsolete Codex-specific prototype verification document. Renamed the host source/package/build/archive to `packages/terminal-host`, `@agentonweb/terminal-host`, `build-terminal-host.mjs` and `agentonweb-terminal-host-0.1.0.tgz`; removed the old names from workspace configuration, lockfile, tests, scripts and guides. No compatibility alias or dormant tool-specific launch path remains in source. Codex is retained only where it is a useful example of an installed CLI or recorded acceptance evidence.

Both READMEs now lead with the local-shell setup and workflow, with DSH optional. Package, store-site, support/privacy and Safari app descriptions reflect that boundary. Published DSH artifacts are distinguished from the terminal feature that currently requires a source build. [Architecture](../architecture.md) and [release instructions](../releasing.md) describe the actual package and process ownership.

The release contract now audits the terminal archive as well as the DSH plugin and extension: reproducible packing, exact contents, included guide/assets, isolated production install, CLI help and a real authenticated shell round trip. Isolated hosts clear inherited shell-startup overrides.

## Verification and delivery

`pnpm release:audit` passed on macOS: 27 test files, 122 passed tests and one optional installed-DSH-bridge test skipped; TypeScript, architecture/privacy checks, Chrome/Firefox/Safari builds and manifests, Safari native validation, reproducible archives and packed-host shell verification. Current Computer coverage and limitations are recorded in [browser acceptance](local-shell-2026-09-20.md).

Changes remain in the working tree and generated artifacts. No commit, push, store/npm publication or deployment occurred. The user's installed background host was not replaced or restarted because it contains live work. Its existing shells remain on their installed version; source fixes were exercised in an isolated test host and the rebuilt extension.
