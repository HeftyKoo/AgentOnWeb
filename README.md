# AgentOnWeb

**[English](README.md)** · **[简体中文](README.zh-CN.md)**

**Your native coding agent, on the website you're using.**

AgentOnWeb brings your coding workspace onto the page you already have open. Watch a video, browse documentation, or keep a website in view while working with your agent—then switch back to the page without leaving your conversation.

The current edition, **DSH On Web**, brings the complete **DeepSeek Harness (DSH)** workspace into Chrome, Firefox, and Safari. Your conversations, tools, approvals, models, and DSH plugins remain available in their familiar interface. This release supports DSH only.

| Mode | What it does |
| --- | --- |
| **Chill** | Work in a translucent workspace with the website visible behind it. Adjust opacity to suit the page. |
| **Focus** | Give the same workspace an opaque background for focused coding. |
| **Watch** | Hide the workspace and use the website normally, with a small dock ready to bring your agent back. |

Switching modes keeps your session running. In Chill, double-tap **Option / Alt** to interact with the website; double-tap again to return to DSH.

## Watch the demo

[![Watch the AgentOnWeb demo on YouTube](https://img.youtube.com/vi/s083RpD38HU/hqdefault.jpg)](https://www.youtube.com/watch?v=s083RpD38HU)

**[English demo](https://www.youtube.com/watch?v=s083RpD38HU)** · **[中文演示](https://www.youtube.com/watch?v=DV8s9z-w4GE)**

See Chill, Focus, Watch, opacity adjustment, and website interaction during a real coding session.

## Get the extension

| Browser | Store installation |
| --- | --- |
| Chrome | [Install from Chrome Web Store](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe) |
| Firefox | [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/agentonweb/) |
| Safari | Coming soon — Mac App Store link will be added after approval. |

<!-- Replace the Safari placeholder with the verified public product URL when its store release is available. -->

The Safari installation link will be added once the Mac App Store release is available. To try AgentOnWeb from source now, follow [Development](#development).

## Start using AgentOnWeb

### 1. Set up DSH

You need **Node.js 22.19+**, **DeepSeek Harness**, and your own model-provider credentials configured in DSH. The browser extension connects to DSH running on your computer.

If DSH is not installed yet:

```sh
npm install -g @deepseek-ai/dsh
```

Configure your provider credentials in DSH, such as `DEEPSEEK_API_KEY`, then install the AgentOnWeb integration and start the workspace:

```sh
dsh plugin --profile web add @agentonweb/dsh-surface
dsh web
```

Keep `dsh web` running while using the extension. If DSH was already running when you installed the plugin, restart it. Model credentials stay in DSH; you do not enter an API key in the extension.

### 2. Connect your browser

1. Install and enable the browser extension, then open a normal website.
2. Click **Connect** in the AgentOnWeb panel. If the panel is hidden, click the extension's toolbar icon or the dock in the lower-right corner.
3. In the DSH page that opens, click **Allow connection**.
4. Return to your website and start working in the DSH workspace.

Safari may also ask you to allow website access and local-session storage access. Follow those browser prompts to finish connecting.

Once approved, the browser reconnects automatically while DSH is running. You can remove its access from **DSH Settings → AgentOnWeb → Revoke connection**.

### 3. Choose how you work

Use the lower-right dock to choose **Chill**, **Focus**, or **Watch**. Chill opens by default and includes an opacity slider. Close the panel or use the toolbar icon to hide it; the dock remains available to reopen it.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Show or hide AgentOnWeb | `Control+Shift+O` | `Alt+Shift+O` |
| Chill / Focus / Watch | `Control+Shift+1 / 2 / 3` | `Alt+Shift+1 / 2 / 3` |
| Switch interaction between DSH and the website in Chill | Double-tap `Option` | Double-tap `Alt` |

Shortcut availability depends on the browser and existing key bindings. You can adjust them in your browser's extension-shortcut settings. AgentOnWeb works on normal HTTP(S) websites; protected browser pages such as extension settings cannot host the workspace.

## Development

### Set up the workspace

Use **Node.js 22.19+** and **pnpm 11.5.0**, with DSH installed and configured as described above.

```sh
git clone https://github.com/HeftyKoo/AgentOnWeb.git
cd AgentOnWeb
pnpm install
pnpm install:dsh-surface
dsh web
```

`pnpm install:dsh-surface` builds and installs the local integration into DSH's Web profile. Restart `dsh web` after updating the plugin.

### Build and load the extension

In another terminal, run the build for your browser:

| Browser | Build command | Output folder |
| --- | --- | --- |
| Chrome 132+ | `pnpm build:extension` | `apps/extension/.output/chrome-mv3` |
| Firefox 140+ | `pnpm build:extension:firefox` | `apps/extension/.output/firefox-mv2` |
| Safari 18.4+ | `pnpm build:extension:safari` | `apps/extension/.output/safari-mv2` |

- **Chrome:** Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the output folder.
- **Firefox:** Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `manifest.json` from the output folder.
- **Safari:** Enable Safari's developer features and use **Add Temporary Extension** with the output folder. For the signed macOS app, see the [Safari build guide](apps/safari/README.md).

Then follow [Connect your browser](#2-connect-your-browser) on a normal website.

### Validate changes

```sh
pnpm check
```

This runs the repository checks, typechecking, tests, and browser builds. Verify interaction changes with the real extension and a running DSH workspace.

For a lightweight presentation preview:

```sh
pnpm build:preview
pnpm preview
```

See the [release guide](docs/releasing.md) for packaging and publishing.

## Links

[Report an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) · [Privacy policy](https://heftykoo.github.io/AgentOnWeb/privacy.html)
