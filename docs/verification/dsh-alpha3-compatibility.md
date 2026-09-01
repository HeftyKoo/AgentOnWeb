# DSH 0.1.2-alpha.3 compatibility

Date: 2026-09-01. Status: the active Overcode DSH surface plugin is compatible with the latest official DSH alpha architecture. This is a local compatibility verification, not a registry/store release.

## Verified upstream baseline

- Official npm preview: `@deepseek-ai/dsh@0.1.2-alpha.3`, published 2026-08-31 16:20:52 UTC under the `alpha` dist-tag.
- Official tag: [`dsh-v0.1.2-alpha.3`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-alpha.3), commit [`dd6322d604e00eec1ba5e0c8541159906a21094a`](https://github.com/deepseek-ai/deepseek-harness/commit/dd6322d604e00eec1ba5e0c8541159906a21094a).
- The npm `latest` and `next` tags still resolve to `0.1.1-rc.2`; Overcode therefore names the exact tested alpha instead of treating a moving/default dist-tag as evidence.

The previous live acceptance used `dsh-v0.1.2-alpha.1`. The `alpha.1` to `alpha.3` source comparison is large (2,200 changed files) and includes Remote/Typert failure vocabulary, Session internals, Web connection recovery, package dependency faces, persistence, and UI work. DSH remains a developer preview and explicitly warns that compatibility-breaking changes will occur.

## Impact on the active plugin

| Overcode dependency | alpha.3 result | Evidence |
| --- | --- | --- |
| Profile bundle installation | Compatible | `dsh plugin --profile web add <package>` still forwards to pnpm and activates packages declaring `dsh.bundle.patch`. The isolated profile included the `@overcode/dsh-surface` layer. |
| Host lifecycle and Web identity | Compatible | `webServer.host`/`port`, `connection.authenticatedUrl()`, `connection.fetch.register()`, and `ctx.effect()` remain available. The plugin started inside the alpha.3 Web process. |
| Authenticated Overcode routes | Compatible | After DSH's normal process-token exchange, `GET /api/overcode/connections` and `GET /api/overcode/native-view` both returned 200 through DSH's Host/Origin and browser-session fence. |
| Client module loading | Compatible after manifest correction | `window.__ModuleLoader__.load`, `dsh.client`, and Web platform modules remain current. The manifest now names `@deepseek-ai/dsh-client-ui-renderer`, the provider of the `slots` service used by Overcode. |
| Additive UI slots | Compatible | The alpha.3 native UI rendered Settings → Overcode through `settings.section`; no conversation, sidebar, tool, approval, or session owner was replaced. |
| Theme presentation | Compatible | `ctx.theme.overrideTokens()` and the `--dsw-*` token family remain current. The native top-level page stayed unmodified; embedded Chill/Watch presentation remains nonce-gated. |
| Native session continuity | Compatible | `ctx.sessions.list`, `refresh()`, `open()`, `clear()`, `refreshSubagents()`, and `openSubagent()` remain in the alpha.3 public client face. |

The breaking internal changes do not cross Overcode's active boundary because Overcode embeds DSH's native Web surface and uses public plugin composition seams. The inactive ACP/custom-overlay prototype packages remain pinned to their historical research baseline and are not imported by the extension or DSH surface plugin.

## Adaptation made

- Raised the supported runtime baseline in the product documentation to exact `0.1.2-alpha.3`.
- Added the client renderer package to `dsh.client.inject`, so the package manifest explicitly describes the latest provider of the `slots` service.
- Declared DSH's Node.js floor (`>=22.19.0`) on the plugin package.
- Fixed the unpublished local plugin package at `0.1.0` until the first release.

## Verification performed

An isolated `$DSH_HOME` and exact official npm artifact were used so the user's existing alpha.1 profile and normal DSH process were not upgraded or rewritten.

1. Installed `@deepseek-ai/dsh@0.1.2-alpha.3` from npm and confirmed `dsh --version` reported `0.1.2-alpha.3`.
2. Built the Overcode plugin and installed it with the alpha.3 CLI into an isolated Web profile.
3. Used `--dump-config` to confirm the final profile contained `# == @overcode/dsh-surface` and the `overcode-surface` row after the native Web bundle.
4. Started `dsh web --no-open --port 3093`. The same alpha.3 process owned the Web listener and Overcode connector listener.
5. Completed DSH's native token-to-cookie exchange and verified both authenticated Overcode routes returned 200.
6. Loaded the real alpha.3 Web client in a browser. It rendered the native workspace and Settings → Overcode, including existing grants, with no console warnings or errors.
7. Ran the repository typecheck, Vitest suite, builds, package archive/import check, and `git diff --check` after the adaptation.

The isolated browser test proves Host and client plugin activation on alpha.3. It does not replace the earlier real-Chrome extension revoke/re-pair acceptance: that destructive authorization cycle was not repeated against the user's normal profile during this compatibility audit.
