# Overcode

**Your coding agent, everywhere.**

Overcode is a Chromium extension that presents the complete DeepSeek Harness Web workspace above the real website. It does not rebuild the agent UI or manage Harness sessions, tools, approvals, models, commands, or plugins. Those remain owned by DSH, so existing habits and Web-profile plugins continue to work in their native surface.

The website also remains the real website: Overcode does not proxy, scrape, clone, or reimplement its login, cookies, playback, DRM, history, recommendations, or controls.

## Product boundary

Overcode owns only:

- injection above normal HTTP(S) pages
- Focus, Chill, and Watch presentation
- transparency and one-gesture website pass-through
- authenticated connection to the local DSH Web process
- lifecycle and secure delivery of the native Web surface

DeepSeek Harness owns:

- its complete Web UI and navigation
- session creation, history, resume, and cancellation
- workspaces, models, agent presets, commands, and settings
- tool rendering, approvals, plugins, and agent behavior

The active V1 path deliberately has no Overcode API for sending prompts or translating agent events.

## Architecture

```text
Real website
  └─ closed Overcode Shadow DOM
       ├─ minimal mode dock
       └─ full-screen DSH Web iframe
            └─ native DSH UI + existing Web-profile plugins

MV3 background
  └─ authenticated ws://127.0.0.1 bridge
       └─ dsh web --no-open --port 0
            └─ additive @overcode/dsh-surface client plugin
```

The Bridge exchanges DSH's one-time launch token outside page JavaScript and returns only a clean local surface URL. The extension service worker installs the resulting HttpOnly cookie in a Chrome partition scoped to each top-level website. Neither the token nor the signed cookie is sent to the content script or exposed to the page.

Active packages:

- `apps/extension`: MV3 background, native-surface host, mode dock, and presentation CSS
- `packages/local-bridge`: loopback pairing server and DSH Web supervisor
- `packages/dsh-surface-plugin`: additive DSH client module for transparency and Alt pass-through
- `packages/shared-protocol`: versioned Bridge protocol containing only surface discovery and ping

The older ACP/custom-overlay packages remain in the workspace as an inactive prototype reference. They are still covered by workspace checks, but they are not imported by the active extension or Bridge path.

## Requirements

- Node.js 22.19 or newer
- pnpm 11.5 for this workspace
- Chrome 132 or newer with Developer mode available
- DeepSeek Harness `dsh-v0.1.2-alpha.1`
- `DEEPSEEK_API_KEY` available to the `dsh` process

The local `dsh` wrapper installed for this project reads `DEEPSEEK_API_KEY` from `~/.hermes/.env` at process start without copying the key into Overcode.

## Develop and run

```sh
pnpm install
pnpm install:dsh-surface
pnpm check
pnpm dev:bridge
```

The first Bridge run prints an eight-digit pairing code. It is valid for ten minutes and five attempts. To revoke the installed credential and issue another code:

```sh
pnpm --filter @overcode/local-bridge dev --reset-pairing
```

Build the extension:

```sh
pnpm build:extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`. Open a normal HTTP(S) page and enter the Bridge pairing code once.

The Bridge launches the normal DSH `web` profile with an additive Overcode patch. It does not replace the profile or its configured plugins.

## Modes and interaction

- **Chill** is the default and remains full-screen. DSH's native layers become highly translucent so the website stays visible behind the coding workspace.
- **Focus** keeps the same native DSH surface but places it over an opaque background.
- **Watch** keeps DSH running and mounted while hiding it, leaving the website fully interactive and a small mode dock in the lower-right corner.
- Hold **Option/Alt** in Chill to temporarily make the full-screen Harness surface click-through; release it to return to DSH.
- Cycle modes with `Alt+Shift+O`; on macOS the manifest requests `Control+Shift+O`. Chrome may remap conflicts at `chrome://extensions/shortcuts`.

Mode changes are presentation-only. They do not recreate a DSH process or agent session.

## Security boundary

- The Bridge binds only to `127.0.0.1`.
- Only the paired `chrome-extension://…` origin can authenticate.
- Pairing stores a random installation credential as a SHA-256 hash on the Bridge.
- DSH launch tokens are exchanged server-side and never reach the website.
- Signed DSH cookies remain in extension memory and Chrome's HttpOnly partitioned cookie store.
- Page JavaScript cannot access Bridge credentials, the socket, the closed Shadow root, or privileged extension messaging.
- Tool approvals and plugin permissions stay inside the native DSH UI.

Bridge pairing state is stored under `~/.config/overcode/bridge-credential.json` by default.

## Verification

`pnpm check` runs typechecking, tests, and all builds. For a lightweight presentation preview:

```sh
pnpm build:preview
pnpm preview
```

The real acceptance surface is the unpacked extension on a normal website with the local Bridge and DSH Web process running.
