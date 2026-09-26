# AgentOnWeb

**[English](README.md)** · **[简体中文](README.zh-CN.md)**

**Your local terminal, on the website you're using.**

AgentOnWeb puts a local workspace over the page you already have open. Use your shell while watching a video or reading documentation, run installed tools such as `codex`, and switch back to the website without stopping your commands.

This checkout provides two independent connections:

- **Local terminal:** a real interactive login shell running on your computer, displayed through a Web terminal. Type `cd`, use your shell's completion, history and aliases, and run any installed CLI. Exiting a CLI returns to the shell. This starts a new host-owned shell; it does not mirror an existing Terminal.app window.
- **DeepSeek Harness (DSH):** DSH's own Web workspace, including its conversations, tools, approvals, models and plugins.

The published extension and DSH plugin are the earlier DSH edition. **Local terminal currently requires building this checkout and installing its local host archive.** The terminal host is not yet published to npm. Live terminal acceptance covers macOS and Chrome; Firefox/Safari builds pass, but live terminal use there and Windows/Linux execution still need acceptance testing.

| Mode | What it does |
| --- | --- |
| **Chill** | A translucent workspace with adjustable background opacity. |
| **Focus** | An opaque background for focused work in the same workspace. |
| **Watch** | Hide the workspace and use the website, keeping a small dock to return. |

Switching modes or hiding the panel keeps local processes running. In Chill, double-tap **Option / Alt** to interact with the website; double-tap again to return to the workspace.

## Start with your local terminal

On macOS, install **Node.js 22.19+** and **pnpm 11.5.0**, then run:

```sh
git clone https://github.com/HeftyKoo/AgentOnWeb.git
cd AgentOnWeb
pnpm install
pnpm --filter @agentonweb/terminal-host pack --pack-destination "$PWD/release"
npm install -g ./release/agentonweb-terminal-host-0.1.0.tgz
pnpm build:extension
aow service install
```

1. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3` from this checkout.
2. Open a normal website. Click the dock's **+** to discover workspaces, choose **Local terminal**, and click **Connect** if prompted.
3. In the private setup tab opened by `aow service install`, click **Allow connection**. Use `aow service open` if you need to reopen that tab.
4. Return to the website and use the shell directly:

   ```sh
   cd ~/your-project
   codex
   ```

Codex is an example, not a dependency of the terminal host. Install and configure your chosen CLI separately. Your shell loads its own startup files; tools use their local credentials and permissions. AgentOnWeb does not select a model or override CLI permissions.

The terminal toolbar's **+** creates another shell; its selector switches between shells and **×** closes one after confirmation. Other tabs can view the same shell; **Control here** transfers typing control. Refreshing or closing the browser view does not stop the process. Stopping the host, logging out or restarting the computer ends live shells.

The macOS service starts at login. For a foreground host, use `aow terminal` and keep it running. For setup, revocation, service updates and platform limits, see the [local terminal guide](packages/terminal-host/README.md).

## Connect DSH

DSH is optional and connects independently of Local terminal. You need **Node.js 22.19+**, DeepSeek Harness and model-provider credentials configured in DSH. The repository's pinned DSH compatibility baseline is recorded in [release-contract.json](release-contract.json).

```sh
npm install -g @deepseek-ai/dsh@0.1.2-alpha.3
dsh plugin --profile web add @agentonweb/dsh-surface@0.1.2
dsh web
```

Keep `dsh web` running. Restart it after installing or updating the plugin. In AgentOnWeb, discover workspaces with the dock's **+**, select **DeepSeek Harness**, and approve **Allow connection** in the DSH page. You can switch between DSH and Local terminal without stopping either.

Model credentials stay in DSH. Revoke the browser through **DSH Settings → AgentOnWeb → Revoke connection**. Safari may request local workspace and session-storage access; follow its prompts.

## Everyday controls

Use the dock to choose Chill, Focus or Watch, switch connected workspaces, or adjust Chill opacity. Close the panel or use the extension toolbar to hide it; the dock can reopen it.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Show or hide AgentOnWeb | `Control+0` | `Alt+0` |
| Chill / Focus / Watch | `Control+1 / 2 / 3` | `Alt+1 / 2 / 3` |
| Terminal ↔ DSH | `` Control+` `` | `` Alt+` `` |
| Switch between the workspace and website in Chill | Double-tap `Option` | Double-tap `Alt` |

Browser shortcuts can take precedence over terminal keys. Adjust extension shortcuts in your browser settings. Normal HTTP(S) websites are supported; protected browser pages such as extension settings cannot host the workspace.

## DSH edition: stores and videos

These store links and videos cover the released DSH workflow. For Local terminal, follow the source installation above.

| Browser | Store installation |
| --- | --- |
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/agentonweb/) |
| Safari | Public store link not yet available in this repository. |

[![Watch the AgentOnWeb DSH demo on YouTube](docs/assets/agentonweb-demo-cover.png)](https://www.youtube.com/watch?v=s083RpD38HU)

**Demo:** [English](https://www.youtube.com/watch?v=s083RpD38HU) · [中文](https://www.youtube.com/watch?v=DV8s9z-w4GE)

**DSH installation tutorial:** [English](https://www.youtube.com/watch?v=CIfW76WAcwA) · [中文](https://www.youtube.com/watch?v=kyeRpiG3asg)

## Development

After `pnpm install`, build and load the extension for your browser:

| Browser | Build command | Output folder |
| --- | --- | --- |
| Chrome 132+ | `pnpm build:extension` | `apps/extension/.output/chrome-mv3` |
| Firefox 140+ | `pnpm build:extension:firefox` | `apps/extension/.output/firefox-mv2` |
| Safari 18.4+ | `pnpm build:extension:safari` | `apps/extension/.output/safari-mv2` |

Firefox uses **Load Temporary Add-on** in `about:debugging#/runtime/this-firefox`; select the output's `manifest.json`. Safari uses **Add Temporary Extension** with developer features enabled. See the [Safari build guide](apps/safari/README.md) for its containing app.

For terminal development, build `pnpm --filter @agentonweb/terminal-host build`, then run `node packages/terminal-host/lib/cli.js terminal`. Only one terminal host can own your user state directory at a time; a running installed service already owns it. See the local terminal guide before stopping or upgrading a service with live shells.

For DSH plugin development, `pnpm install:dsh-surface` builds and installs the checkout into DSH's Web profile; then restart `dsh web`.

```sh
pnpm check
pnpm release:audit
```

`check` runs repository checks, TypeScript, tests and browser builds. `release:audit` additionally validates reproducible extension, DSH and terminal archives, including an isolated terminal package install and real shell smoke test. Verify interaction changes with the real extension and intended runtime; builds alone do not prove live browser support.

For an offline presentation sample, run `pnpm build:preview` and `pnpm preview`. The sample does not execute commands. See the [architecture](docs/architecture.md) and [release guide](docs/releasing.md) for implementation and packaging details.

[Report an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) · [Privacy policy](https://heftykoo.github.io/AgentOnWeb/privacy.html)

### Shortcut scope

The table shows default bindings. Show/hide and mode keys run only through browser extension commands; remap or clear them in the browser's extension shortcut settings to keep those keys available to terminal applications. There is no hard-coded page or iframe fallback for mode keys.

The runtime-switch key is reserved inside embedded Terminal/DSH inputs. On the host website it works only while the workspace is active or the dock is expanded, and leaves editable website fields alone. Hidden workspaces cannot forward shortcut actions. Standalone native runtime pages do not capture it. With more than two runtimes, it cycles their displayed order.

Firefox on Linux uses Alt+digits to select browser tabs; choose different extension command bindings there. Windows and macOS use different browser tab shortcuts.

### Codex session activity

The page launcher lists running Codex sessions and opens their exact terminal tabs. Completion and approval requests produce page notifications; approve or deny in the native Codex terminal. Enable the integration once with `aow codex-hooks install`, review/trust its hooks in Codex `/hooks`, and start a new Codex session in a terminal created by the updated host. See [setup, event flow and limits](docs/agent-notifications.md).

## One-command setup (macOS + Chrome)

The new `aow setup` entry configures the service, Chrome native pairing and Codex notifications together. Global npm installs run it when lifecycle scripts are permitted; the release shell installer calls it explicitly. Codex hook trust remains a first-use user action. The package and installer are not published yet. See [One-command setup (macOS + Chrome)](docs/one-command-setup.md).

**Installation changes:** global installation starts a per-user service at login, registers a Chrome native host, and updates Codex hooks/notify with backups. Use `AOW_SKIP_SETUP=1` to skip automatic setup. To remove these integrations, finish active terminal work and run `aow uninstall` **before** `npm uninstall -g @agentonweb/terminal-host`; service terminals will stop. User settings, CLI history and backups remain.
