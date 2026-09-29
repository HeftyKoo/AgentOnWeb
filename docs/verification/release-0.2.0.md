# 0.2.0 release preparation — September 29, 2026

## Scope and compatibility

The release candidate aligns all AgentOnWeb package versions at 0.2.0 and Safari at 0.2.0 / build 6. The default branch is `main`. The DSH stale-cookie fix from `5740f07` is integrated with the branch's multi-runtime connection management.

The npm latest DSH version checked on this date is **0.1.7-rc.2**. User instructions install `@deepseek-ai/dsh@latest`; `release-contract.json` and plugin metadata record the version actually verified, not an alpha.3 restriction or a guarantee about future releases. The new `dsh-latest` CI job installs the current npm latest and exercises the packed plugin and actual browser authentication.

A clean installation of the former `0.1.2-alpha.3` baseline failed before HTTP startup with `user patch-layer watching requires the Cordis HMR service`. Its transitive dependencies now resolve to newer packages. Existing alpha.3 installation evidence must not be reused as clean-install evidence for this release.

## Verified locally

- Complete `pnpm release:audit`, including privacy/architecture, TypeScript, 41 test files, browser builds, Safari native manifest validation, reproducible archives and isolated terminal installation with real shell input/output.
- With `DSH_CONNECTION_MODULE` pointing to the freshly installed latest DSH connection module, all **201 tests** pass, including the otherwise opt-in DSH HTTP bridge test.
- `pnpm prepare:safari` prepares the offline demo, synchronized Xcode resources and Safari ZIP with aligned target versions.
- Terminal npm publication dry run accepts the 0.2.0 audited TGZ. This does not validate publication credentials or publish anything.
- Latest DSH: isolated Web-profile installation of the actual packed 0.2.0 plugin, successful startup, authenticated connections/native-view API responses, native UI and Settings → AgentOnWeb rendering without page errors.
- Latest DSH + Chromium 147: stale-first-party-cookie reproduction gives 401 before delegation; extension iframe returns 200, authenticated API and WebSocket handshake succeed, original first-party cookie is preserved, and revocation removes header delegation.
- Workflow YAML parses, modified Markdown relative links resolve, and `git diff --check` passes.

The archive audit and DSH browser tests share the four connector discovery ports. Run them sequentially when other local runtimes are active; concurrent test instances can exhaust the available ports. No installed user service was stopped or restarted for these checks.

## Repeat the latest DSH checks

Install test dependencies in a separate prefix. `playwright-core` provides its browser installer; on Linux install Chromium's OS dependencies and run the browser tests under `xvfb-run -a`. On macOS use an installed Chrome for Testing executable.

```sh
npm install --prefix /tmp/aow-dsh-latest --no-audit --no-fund @deepseek-ai/dsh@latest playwright-core
node /tmp/aow-dsh-latest/node_modules/playwright-core/cli.js install chromium
pnpm release:audit
DSH_CONNECTION_MODULE=/tmp/aow-dsh-latest/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js pnpm exec vitest run packages/dsh-surface-plugin/src/routes.test.ts
node scripts/check-dsh-plugin.mjs --deps /tmp/aow-dsh-latest --chromium /path/to/chrome-for-testing
node scripts/check-dsh-auth-browser.mjs --deps /tmp/aow-dsh-latest --chromium /path/to/chrome-for-testing
```

These tests use temporary DSH profiles/browser profiles and make no model requests. The plugin test also uses a temporary home directory, so it does not modify existing DSH or browser grants. Browser tests require a free connector port.

## Publication gates remaining

At preparation time, npm returns 0.1.1 for the DSH plugin and no public terminal-host package. No 0.2.0 release tags exist. The repository has an `NPM_TOKEN` secret, but its ability to create/publish the terminal package has not been tested with a real publication.

Before announcing availability: publish npm/GitHub artifacts, test the downloaded installer with the matching extension in a clean macOS user environment, deploy support/privacy pages, submit browser-store builds and confirm each store's actual status. The latest DSH checks cover integration and authentication, not model-provider execution or billing. End-to-end Codex hook trust/approval notifications and the complete setup/upgrade/uninstall path still need the final interactive release acceptance. Firefox/Safari live terminal acceptance and Windows/Linux terminal support are not implied by builds or CI.
