# AgentOnWeb for DeepSeek Harness

**Use your coding agent on the website you already have open.**

AgentOnWeb brings the complete DeepSeek Harness (DSH) workspace onto ordinary web pages. Keep a video or documentation visible while you code, use your existing DSH conversations and tools, and switch back to the website without leaving your session.

`@agentonweb/dsh-surface` connects your local DSH workspace to the **AgentOnWeb browser extension**. You need both this DSH plugin and the browser extension to use AgentOnWeb. The current edition supports DeepSeek Harness.

## See it in action

[English YouTube demo](https://www.youtube.com/watch?v=s083RpD38HU) · [中文 YouTube 演示](https://www.youtube.com/watch?v=DV8s9z-w4GE)

## What you can do

| Mode | Experience |
| --- | --- |
| **Chill** | Code in a translucent workspace while the website stays visible behind it. Adjust opacity from the dock. |
| **Focus** | Use an opaque workspace when you want to concentrate on coding. |
| **Watch** | Hide the workspace and use the website normally. Reopen your agent from the small dock. |

Your DSH session keeps running when you change modes. In Chill, double-tap **Option** on macOS or **Alt** on Windows/Linux to interact with the website; double-tap again to return to DSH.

## Get started

### 1. Prepare DSH

You need:

- **Node.js 22.19 or newer**.
- **DeepSeek Harness 0.1.2-alpha.3** running on the same computer as your browser.
- Your own model-provider credentials configured in DSH, such as `DEEPSEEK_API_KEY`. Model-service usage is billed by your provider.
- The **AgentOnWeb browser extension** for Chrome, Firefox, or Safari. See the [extension installation page](https://github.com/HeftyKoo/AgentOnWeb#get-the-extension) for available store links and installation options.

If you have not installed DSH yet:

```sh
npm install -g @deepseek-ai/dsh@0.1.2-alpha.3
```

### 2. Install this plugin and start DSH

Install through DSH's plugin manager so the integration is enabled in your Web profile:

```sh
dsh plugin --profile web add @agentonweb/dsh-surface@0.1.1
dsh web
```

If DSH was already running, restart `dsh web` after installing the plugin. Keep it running while you use AgentOnWeb. No repository checkout or build step is needed for this npm package.

### 3. Connect the browser extension

1. Enable AgentOnWeb in your browser and open a normal website.
2. Click **Connect** in the AgentOnWeb panel. If it is hidden, use the extension's toolbar icon or the dock in the lower-right corner.
3. In the DSH page that opens, click **Allow connection**.
4. Return to your website. Your DSH workspace is ready to use.

Safari may also ask for website access and local-session storage access. Complete those browser prompts to finish connecting.

Once approved, the browser can reconnect while DSH is running. You do not need to enter a pairing code, port, or API key in the extension.

### 4. Work from the page

Choose **Chill**, **Focus**, or **Watch** from the lower-right dock. Your existing DSH conversations, model settings, tools, approvals, and plugins remain available in the DSH interface.

Use the browser toolbar icon to show or hide AgentOnWeb. The default shortcut is **Control+Shift+O** on macOS or **Alt+Shift+O** elsewhere; you can adjust it in your browser's extension-shortcut settings.

## Common questions

**The extension cannot find DSH.** Make sure this plugin is installed in the Web profile, then restart `dsh web` and leave it running on the same computer as the browser. Click **Connect** again. The extension cannot start a stopped DSH process.

**The connection approval expired.** Click **Connect** again and approve the new request in the DSH page. Approval requests expire after two minutes.

**AgentOnWeb does not appear on a page.** Try a normal HTTP(S) website and check the extension's website permissions. Browser settings pages and other protected browser pages cannot host the workspace.

**How do I disconnect a browser?** Open **DSH Settings → AgentOnWeb → Revoke connection**. Connecting that browser again requires your approval.

**Where do I enter my model API key?** Configure it in DSH. The browser extension has no API-key setup and does not include a model-service subscription.

## Help

[AgentOnWeb setup guide](https://github.com/HeftyKoo/AgentOnWeb#readme) · [Report an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) · [Privacy policy](https://heftykoo.github.io/AgentOnWeb/privacy.html)
