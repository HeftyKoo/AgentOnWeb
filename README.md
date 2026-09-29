# AgentOnWeb

**[English](README.md)** · **[简体中文](README.zh-CN.md)**

**Your native coding agent, on the website you're using.**

AgentOnWeb brings your coding workspace onto the page you already have open. Watch a video, browse documentation, or keep a website in view while working with your agent—then switch back to the page without leaving your conversation.

**Use Codex right on the page.** Open your project in the built-in terminal, follow running sessions, and get notified when a task finishes or needs approval. Click a session to return to its terminal. AgentOnWeb also supports the complete **DeepSeek Harness (DSH)** workspace, including conversations, tools, approvals, models and plugins.

| Mode | What it does |
| --- | --- |
| **Chill** | Work in a translucent workspace with the website visible behind it. Adjust opacity to suit the page. |
| **Focus** | Give the same workspace an opaque background for focused coding. |
| **Watch** | Hide the workspace and use the website normally, with a small dock ready to bring your agent back. |

Switching modes keeps your session running. In Chill, double-tap **Option / Alt** to interact with the website; double-tap again to return to your workspace.

## Watch the demo

[![Watch the AgentOnWeb demo on YouTube](docs/assets/agentonweb-demo-cover.png)](https://www.youtube.com/watch?v=s083RpD38HU)

**[English demo](https://www.youtube.com/watch?v=s083RpD38HU)** · **[中文演示](https://www.youtube.com/watch?v=DV8s9z-w4GE)**

See Chill, Focus, Watch, opacity adjustment, and website interaction during a real coding session.

## Installation & usage tutorial

**[English tutorial](https://www.youtube.com/watch?v=CIfW76WAcwA)** · **[中文教程](https://www.youtube.com/watch?v=kyeRpiG3asg)**

A 100-second walkthrough of DSH setup, Chrome Web Store installation, Connect authorization, creating your first code file, and using Chill, Focus, and Watch. Both videos include subtitles and chapter timestamps.

## Get the extension

| Browser | Store installation |
| --- | --- |
| Chrome | [Install from Chrome Web Store](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe) |
| Firefox | [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/agentonweb/) |
| Safari | Coming soon — Mac App Store link will be added after approval. |

## Use Codex

For **macOS + Chrome**. Have [Node.js 22.19+](https://nodejs.org/en/download) and Codex installed and signed in.

### 1. Set up your terminal

Run this once in your Mac's Terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash
```

The installer sets up the local terminal, automatic startup, Chrome connection and Codex notifications. Existing Codex settings are preserved.

### 2. Start Codex on any website

Open a website and click AgentOnWeb. In its terminal, enter your project directory and start Codex:

```sh
cd ~/your-project
codex
```

For session notifications, open `/hooks` in Codex, review and trust **AgentOnWeb session status**, then start a new Codex session. You only need to do this once for the installed hooks.

Use **+** in the terminal tab bar to open another project, click a tab to switch, double-click its name to rename it, or click **×** to close it. Hiding the workspace or refreshing the page keeps your sessions running.

[Setup and troubleshooting](docs/one-command-setup.md) · [Terminal guide](packages/terminal-host/README.md)

## Use DeepSeek Harness

### 1. Set up DSH

You need **Node.js 22.19+**, **DeepSeek Harness**, and your own model-provider credentials configured in DSH. The browser extension connects to DSH running on your computer.

If DSH is not installed yet:

```sh
npm install -g @deepseek-ai/dsh@latest
```

Configure your provider credentials in DSH, such as `DEEPSEEK_API_KEY`, then install the AgentOnWeb integration and start the workspace:

```sh
dsh plugin --profile web add @agentonweb/dsh-surface@0.2.0
dsh web
```

Keep `dsh web` running while using the extension. If DSH was already running when you installed the plugin, restart it. Model credentials stay in DSH; you do not enter an API key in the extension.

### 2. Connect your browser

1. Install and enable the browser extension, then open a normal website.
2. Open AgentOnWeb from the extension toolbar icon or the lower-right dock. Expand the dock, click **+**, select **DeepSeek Harness**, and click **Connect** if prompted.
3. In the DSH page that opens, click **Allow connection**.
4. Return to your website and start working in the DSH workspace.

Safari may also ask you to allow website access and local-session storage access. Follow those browser prompts to finish connecting.

Once approved, the browser reconnects automatically while DSH is running. You can remove its access from **DSH Settings → AgentOnWeb → Revoke connection**.

## Everyday controls

Use the dock to switch between your Codex terminal and DSH workspace. Both keep running while you work in the other.

Use the lower-right dock to choose **Chill**, **Focus**, or **Watch**. Chill opens by default and includes an opacity slider. Close the panel or use the toolbar icon to hide it; the dock remains available to reopen it.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Show or hide AgentOnWeb | `Control+0` | `Alt+0` |
| Chill / Focus / Watch | `Control+1 / 2 / 3` | `Alt+1 / 2 / 3` |
| Switch workspaces | `` Control+` `` | `` Alt+` `` |
| Switch interaction between the workspace and the website in Chill | Double-tap `Option` | Double-tap `Alt` |

Shortcut availability depends on the browser and existing key bindings. You can adjust them in your browser's extension-shortcut settings. AgentOnWeb works on normal HTTP(S) websites; protected browser pages such as extension settings cannot host the workspace.

## Development

For source installation, browser builds and validation, see the [development guide](docs/development.md). Packaging and publishing are covered in the [release guide](docs/releasing.md).

## Links

[Report an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) · [Privacy policy](https://heftykoo.github.io/AgentOnWeb/privacy.html) · [Changelog](CHANGELOG.md)
