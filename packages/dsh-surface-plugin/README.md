# AgentOnWeb DSH integration

`@agentonweb/dsh-surface` **0.2.0** connects the native DeepSeek Harness Web workspace to AgentOnWeb. Conversations, models, tools, approvals and DSH plugins stay in DSH's own interface. AgentOnWeb also supports a separate local terminal; this package supplies only the DSH integration.

## Install and connect

Use Node.js **22.19+**. Install the latest DSH. This release was verified against **0.1.7-rc.2**, the npm latest version on September 29, 2026; it is independent of AgentOnWeb's version. Future DSH releases require the same compatibility checks.

```sh
npm install -g @deepseek-ai/dsh@latest
dsh plugin --profile web add @agentonweb/dsh-surface@0.2.0
dsh web
```

Restart `dsh web` after installing or upgrading the plugin, and keep it running. Configure model-provider credentials in DSH; the extension does not need an API key.

Install the matching AgentOnWeb extension. On a normal HTTP(S) website, expand its dock, use **+** to discover workspaces, select **DeepSeek Harness**, and approve **Allow connection** in the DSH page. Safari may also request local workspace and session-storage access. Revoke access in **DSH Settings → AgentOnWeb → Revoke connection**.

## Use the workspace

- **Chill:** translucent workspace with adjustable opacity. Double-tap Option / Alt to interact with the website, and again to return.
- **Focus:** opaque workspace for focused work.
- **Watch:** hide the workspace and keep its dock available.
- Switch between DSH and Local terminal without stopping either runtime. Local terminal requires the separately installed `@agentonweb/terminal-host` package.

Default show/hide and mode shortcuts are `Control+0 / 1 / 2 / 3` on macOS and `Alt+0 / 1 / 2 / 3` on Windows/Linux. Remap them through the browser's extension shortcut settings if they conflict with your tools. Runtime switching uses Control+backtick on macOS or Alt+backtick elsewhere, with the scope explained in the root guide.

## Troubleshooting and development

If discovery fails, check that DSH is running on the same computer and this plugin is installed in the **web** profile. Restart DSH after an update. If authorization was revoked, connect and approve again. Protected browser pages cannot host the overlay. Provider errors and tool approvals are handled by DSH.

The npm archive includes prebuilt JavaScript and the Cordis patch; no install-time build is required. For source development use `pnpm install`, `pnpm install:dsh-surface`, and `pnpm release:audit` from the repository root.

[English guide](https://github.com/HeftyKoo/AgentOnWeb/blob/main/README.md) · [中文指南](https://github.com/HeftyKoo/AgentOnWeb/blob/main/README.zh-CN.md) · [Release guide](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/releasing.md) · [Support](https://github.com/HeftyKoo/AgentOnWeb/issues) · [Privacy](https://heftykoo.github.io/AgentOnWeb/privacy.html)
