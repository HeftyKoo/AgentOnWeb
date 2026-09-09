---
layout: default
title: AgentOnWeb Support
---
# AgentOnWeb for Safari

Your native coding agent, on the page you are using. Current edition: DSH On Web.

AgentOnWeb displays the complete DeepSeek Harness workspace over normal websites. Use **Chill** for a translucent workspace, **Focus** for an opaque workspace, or **Watch** to keep the website fully interactive with a small mode dock. Conversations, models, tools, approvals, and plugins stay in DSH's native interface.

## Requirements

- macOS 15.4 or later with Safari 18.4 or later.
- Node.js 22.19 or later.
- DeepSeek Harness `0.1.2-alpha.3` and the AgentOnWeb DSH plugin `0.1.0` running locally.
- Your own model-provider credentials for DSH. Provider usage may incur separate charges.

The Safari extension does not include or start DSH, and does not include a model-service subscription. This edition supports DSH; other agent runtimes are not supported.

## Setup

1. Install DeepSeek Harness using its [official instructions](https://www.npmjs.com/package/@deepseek-ai/dsh). Configure your provider credentials in DSH.
2. Add the AgentOnWeb plugin to DSH's Web profile:

   ```sh
   dsh plugin --profile web add @agentonweb/dsh-surface@0.1.0
   ```

3. Start or restart DSH with `dsh web` and keep it running.
4. Open the AgentOnWeb macOS app, then open Safari Settings → Extensions. Enable AgentOnWeb and allow access to the websites where you want to use it.
5. Visit a normal HTTP or HTTPS website. Open AgentOnWeb from the toolbar or page dock, select **Connect**, and approve **Allow connection** in the native DSH window.
6. Allow AgentOnWeb access to `localhost` and `127.0.0.1` when Safari asks.
7. Return to the website and choose Chill or Focus. If **Allow your local session** appears, choose **Open local workspace**, then **Continue to website**, then **Allow local session**. Accept Safari's local-session prompt for that website.
8. Choose Chill, Focus, or Watch from the dock.

You do not enter an API key into the browser extension. The first local connection requires your approval; later connections can reuse that authorization. Revoke it in DSH Settings → AgentOnWeb.

## Everyday controls

- Click the Safari toolbar button to show or hide AgentOnWeb.
- Click the small page dock to reveal mode controls.
- In Chill, double-tap Option to switch interaction between the website and DSH.
- Adjust the Chill opacity slider to keep the underlying page visible.
- Escape dismisses the workspace. Changing display modes does not recreate your agent session.

## Troubleshooting

If no runtime is found, confirm `dsh web` is running on the same Mac and the plugin is installed in the Web profile. Restart DSH after adding the plugin. If a connection request expired, select Connect again and approve the new request in DSH.

If AgentOnWeb is absent on a page, check Safari's extension and website-access settings. Safari internal pages and other protected browser pages do not allow normal extension injection.

If you revoked a browser, reconnect and approve it again. Model errors, billing, and tool approvals are handled in DSH and by your configured provider.

## Support

[Report an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) with your macOS, Safari, DSH, and AgentOnWeb versions and steps to reproduce. Do not include API keys, tokens, private code, or personal information.

[Source and releases](https://github.com/HeftyKoo/AgentOnWeb) · [Privacy policy](privacy.html)
