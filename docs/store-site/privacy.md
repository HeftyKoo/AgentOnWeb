---
layout: default
title: Privacy Policy
---
# AgentOnWeb Privacy Policy

Effective date: September 9, 2026

AgentOnWeb is an open-source Safari extension that displays a locally running DeepSeek Harness (DSH) workspace over the website you are using. This policy covers the AgentOnWeb extension and its macOS containing app.

## Data handled on your Mac

AgentOnWeb stores display preferences and a randomly generated connection credential in local browser extension storage. The credential lets your browser reconnect to a DSH instance you have approved. The companion DSH plugin stores connection credential hashes and a native workspace navigation bookmark on your Mac.

The extension uses tab identifiers and website origins to manage its overlay and the local connection. For Safari, a temporary request-header rule is restricted to the relevant tab and the exact local DSH surface. This rule carries the local session credential and is removed when the tab closes, the surface changes, or the connection is revoked. Website scripts do not receive this credential.

## Collection and sharing

AgentOnWeb does not operate an analytics service, advertising service, or developer-hosted data backend. The extension and containing app do not send your browsing history, website contents, prompts, or connection credentials to the AgentOnWeb developer. AgentOnWeb does not sell personal information or track users across apps and websites for advertising.

The workspace displayed inside the extension is provided by DSH. Anything you type, attach, or authorize in that workspace is handled by DSH and the model providers or plugins you configure. Those services may process information outside your Mac under their own policies. AgentOnWeb does not promise that your AI conversations remain offline. The extension itself does not automatically scrape or transmit the underlying webpage to a model.

## Permissions

Website access allows AgentOnWeb to display its controls and workspace on the websites you permit in Safari. Storage keeps your preferences and local connection. Tab access coordinates the workspace across tabs. Cookie and request-rule permissions support authenticated access to the local runtime. These permissions are not used for advertising or analytics.

## Your controls

You can limit website access or disable the extension in Safari Settings → Extensions. Revoke an authorized browser in DSH Settings → AgentOnWeb. Uninstalling the extension removes it from Safari; local DSH data remains managed by DSH. You can delete the AgentOnWeb plugin's local configuration in `~/.config/agentonweb/deepseek-harness/` after revoking connections and stopping DSH.

## Support and this website

If you voluntarily submit a support issue, GitHub processes the information you include. Issues are public: do not include passwords, API keys, private code, or personal information. This documentation is hosted by GitHub Pages, whose infrastructure may process technical access information under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Contact and updates

For privacy questions, [open an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) without sensitive details. Material changes to this policy will be published here with an updated effective date.

[Support and setup](./)
