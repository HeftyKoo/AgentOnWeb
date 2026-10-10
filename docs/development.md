# Development

Use Node.js 22.19+ and pnpm 11.5.0.

```sh
git clone https://github.com/HeftyKoo/AgentOnWeb.git
cd AgentOnWeb
pnpm install
```

After `pnpm install`, build and load the extension for your browser:

| Browser | Build command | Output folder |
| --- | --- | --- |
| Chrome 132+ | `pnpm build:extension` | `apps/extension/.output/chrome-mv3` |
| Firefox 140+ | `pnpm build:extension:firefox` | `apps/extension/.output/firefox-mv2` |
| Safari 18.4+ | `pnpm build:extension:safari` | `apps/extension/.output/safari-mv2` |

Chrome uses **Developer mode → Load unpacked** in `chrome://extensions`; select the output folder. Firefox uses **Load Temporary Add-on** in `about:debugging#/runtime/this-firefox`; select the output's `manifest.json`. Safari uses **Add Temporary Extension** with developer features enabled. See the [Safari build guide](../apps/safari/README.md) for its containing app.

Arc can deliver Control+1/2/3 to a webpage without dispatching the extension's mode commands. The content script falls back to the default mode keys on non-editable HTTP(S) pages, including when the workspace is dismissed. It reads current command bindings at page load and when the page regains focus; clearing or remapping a mode command disables its default page fallback. Both keyboard paths pass through the background, which coalesces the same mode from opposite paths in the same tab within 250 ms. No Global shortcut scope is required for this fallback. Browser-owned shortcuts that never reach the page, website editors, and native workspace iframes still rely on browser commands. Reload the extension and the test webpage when checking a new build.

For terminal development, build `pnpm --filter @agentonweb/terminal-host build`, then run `node packages/terminal-host/lib/cli.js terminal`. Only one terminal host can own your user state directory at a time; a running installed service already owns it. See the local terminal guide before stopping or upgrading a service with live shells.

For DSH plugin development, `pnpm install:dsh-surface` builds and installs the checkout into DSH's Web profile; then restart `dsh web`.

```sh
pnpm check
pnpm release:audit
```

`check` runs repository checks, TypeScript, tests and browser builds. `release:audit` additionally validates reproducible extension, DSH and terminal archives, including an isolated terminal package install and real shell smoke test. Verify interaction changes with the real extension and intended runtime; builds alone do not prove live browser support.

For an offline presentation sample, run `pnpm build:preview` and `pnpm preview`. The sample does not execute commands. See the [architecture](architecture.md) and [release guide](releasing.md) for implementation and packaging details.

[Report an issue](https://github.com/HeftyKoo/AgentOnWeb/issues) · [Privacy policy](https://heftykoo.github.io/AgentOnWeb/privacy.html)


## Local host installation

```sh
pnpm --filter @agentonweb/terminal-host pack --pack-destination "$PWD/release"
AOW_SKIP_SETUP=1 npm install -g ./release/agentonweb-terminal-host-0.2.0.tgz
aow setup --extension-id YOUR_UNPACKED_CHROME_EXTENSION_ID
```

Use the extension ID shown on `chrome://extensions` for your unpacked build. The public installer enrolls the official store extension automatically. Finish active shell work before restarting a running host.
