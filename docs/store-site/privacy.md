---
layout: default
title: Privacy Policy
---
# AgentOnWeb Privacy Policy

Effective date: September 20, 2026

AgentOnWeb is an open-source browser extension for Chrome, Firefox, and Safari that displays local workspaces over the website you are using. The published DSH edition embeds DeepSeek Harness; the current source checkout also includes a local terminal host. This policy covers the browser extensions, the Safari macOS containing app, the DSH integration and the local terminal host.

## Data handled on your computer

AgentOnWeb stores display preferences and randomly generated connection credentials in local browser extension storage. Each credential lets your browser reconnect to a local runtime you have approved. The companion DSH plugin stores connection credential hashes and a native workspace navigation bookmark on your computer.

The extension uses tab identifiers and website origins to manage its overlay and the local connection. For Safari, a temporary request-header rule is restricted to the relevant tab and the exact local workspace surface. Native top-level management pages retain their own cookies. This rule carries the local session credential and is removed when the tab closes, the surface changes, or the connection is revoked. Website scripts do not receive this credential.

The local terminal host runs shells under your OS user account. Terminal input/output and a bounded screen/scrollback snapshot are kept in memory for connected viewers. AgentOnWeb does not persist terminal transcripts; your shell and commands may save history, files or logs themselves. The host stores browser-grant hashes, a private setup endpoint and service diagnostics under `~/.agentonweb/terminal/`. Its macOS LaunchAgent stores startup paths, PATH and shell selection under `~/Library/LaunchAgents/`. The terminal view remembers its selected shell in browser session storage. A separate administrator cookie authorizes pairing management and is not delegated to embedded viewers.

## Collection and sharing

AgentOnWeb does not operate an analytics service, advertising service, or developer-hosted data backend. The extension and containing app do not send your browsing history, website contents, prompts, or connection credentials to the AgentOnWeb developer. AgentOnWeb does not sell personal information or track users across apps and websites for advertising.

In the DSH workspace, anything you type, attach or authorize is handled by DSH and the model providers or plugins you configure. In Local terminal, commands run on your computer with your user permissions. Those commands may read files, use the system clipboard or send data to their configured services; terminal text is delivered locally between the host and browser. Those services may process information outside your computer under their own policies. AgentOnWeb does not promise that your AI conversations remain offline. The extension itself does not automatically scrape or transmit the underlying webpage to a model.

## Permissions

Website access allows AgentOnWeb to display its controls and workspace on the websites you permit in your browser. Storage keeps your preferences and local connection. Tab access coordinates the workspace across tabs. Cookie permissions support authenticated access to the local runtime; Safari additionally uses temporary request-header rules. Alarms allow the extension to check and restore the local connection. These permissions are not used for advertising or analytics.

## Your controls

You can limit website access or disable the extension in your browser’s extension settings. Revoke a DSH browser in DSH Settings → AgentOnWeb. For Local terminal, run `aow service open` and revoke it in the private setup page. Revocation removes access but does not stop running shell commands. `aow service uninstall` stops the host’s live terminals and removes automatic startup; saved browser grants and CLI history remain. Uninstalling the extension removes it from the browser; local DSH data remains managed by DSH. You can delete the AgentOnWeb plugin's local configuration in `~/.config/agentonweb/deepseek-harness/` after revoking connections and stopping DSH. After stopping the terminal host, you can delete `~/.agentonweb/terminal/` to remove its saved connection grants and diagnostics.

## Support and this website

If you voluntarily submit a support issue, GitHub processes the information you include. Issues are public: do not include passwords, API keys, private code, or personal information. This documentation is hosted by GitHub Pages, whose infrastructure may process technical access information under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Contact and updates

For privacy questions, [open an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) without sensitive details. Material changes to this policy will be published here with an updated effective date.

[Support and setup](./)
