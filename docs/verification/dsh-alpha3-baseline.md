# DSH runtime baseline

## Supported runtime

- npm package: `@deepseek-ai/dsh@0.1.2-alpha.3`
- official tag: [`dsh-v0.1.2-alpha.3`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-alpha.3)
- source commit: [`dd6322d604e00eec1ba5e0c8541159906a21094a`](https://github.com/deepseek-ai/deepseek-harness/commit/dd6322d604e00eec1ba5e0c8541159906a21094a)
- Node.js: 22.19.0 or newer

AgentOnWeb targets this exact DSH preview. The repository contains no branches, adapters, or shims for another DSH release.

## Required DSH surfaces

- `dsh plugin --profile web add <package>` and `dsh.bundle.patch`
- `webServer.host`, `webServer.port`, `connection.authenticatedUrl()`, `connection.fetch.register()`, and `ctx.effect()`
- `window.__ModuleLoader__.load` and the injected theme, renderer, layout, settings, and session-controller modules
- `settings.section` and `shell.overlay` slots
- `ctx.theme.overrideTokens()` and the `--dsw-*` token family
- `ctx.sessions.list`, `refresh()`, `open()`, `clear()`, `refreshSubagents()`, and `openSubagent()`

## Verification contract

The supported runtime must satisfy all of the following with the current source:

1. The plugin builds and installs through the DSH Web-profile plugin manager.
2. The generated profile activates `@agentonweb/dsh-surface` after the native Web bundle.
3. One `dsh web` process owns both the Web listener and AgentOnWeb connector listener.
4. DSH's token-to-cookie exchange succeeds without exposing the launch token to the extension content script.
5. Authenticated `GET /api/agentonweb/connections` and `GET /api/agentonweb/native-view` requests return successfully.
6. The native workspace and Settings -> AgentOnWeb render without console errors.
7. `pnpm check`, isolated package archive inspection, extracted-package import, and `git diff --check` pass.

This is the complete supported DSH host/client boundary for the initial AgentOnWeb release.
