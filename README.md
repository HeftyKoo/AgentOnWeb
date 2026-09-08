# AgentOnWeb

**Agent On Web. Your native agent, on the page you're using.**

AgentOnWeb brings native coding agents onto real websites. The current edition is **DSH On Web**: a WXT browser extension for Chrome, Firefox, and Safari that presents the complete DeepSeek Harness Web workspace above the page you're using. Watch a video, write code in Chill, double-tap Option/Alt to interact with the page, then return to the same conversation.

DSH On Web keeps the native agent experience intact. AgentOnWeb does not rebuild the agent UI or manage Harness sessions, tools, approvals, models, commands, or plugins. Those remain owned by DSH, so existing habits and Web-profile plugins continue to work in their native surface. Other agent runtimes are a future integration direction, not a feature of this edition.

The website also remains the real website: AgentOnWeb does not proxy, scrape, clone, or reimplement its login, cookies, playback, DRM, history, recommendations, or controls.

## Product boundary

AgentOnWeb owns only:

- injection above normal HTTP(S) pages
- Focus, Chill, and Watch presentation
- transparency and one-gesture website pass-through
- authenticated connection to a local runtime's AgentOnWeb plugin
- secure delivery of the native Web surface (the runtime owns its process lifecycle)

DeepSeek Harness owns:

- its complete Web UI and navigation
- session creation, history, resume, and cancellation
- workspaces, models, agent presets, commands, and settings
- tool rendering, approvals, plugins, and agent behavior

The active V1 path deliberately has no AgentOnWeb API for sending prompts or translating agent events.

## Architecture

```text
Real website
  └─ closed AgentOnWeb Shadow DOM
       ├─ collapsible Pixel Seed icon controls
       └─ full-screen DSH Web iframe
            └─ native DSH UI + existing Web-profile plugins

WXT browser background
  ├─ ConnectionCoordinator (connection state machine)
  ├─ Chrome/Firefox PartitionLeases (per-site cookie ownership)
  ├─ Safari SessionLeases (tab-bound declarative header delivery)
  └─ authenticated loopback connector protocol v1
       └─ AgentOnWeb DSH plugin, INSIDE the existing dsh web process
            ├─ native DSH authorization + Settings → AgentOnWeb
            └─ additive transparency and Option pass-through client
```

The DSH plugin exchanges the runtime's launch token inside the local process and returns the clean surface URL plus its browser-session cookie only to the authenticated extension background. Chrome and Firefox install that HttpOnly cookie in a partition scoped to each top-level website. Safari, whose WebExtension cookies API does not expose the same partition key and whose blocking `webRequest` response is unsupported, installs a session-only `declarativeNetRequest` rule scoped to the mounted tab and exact localhost surface. Neither token nor signed cookie is sent to the content script, persisted by the Safari lease, or exposed to website JavaScript.

Active packages:

- `apps/extension`: WXT Chrome MV3 plus Firefox/Safari MV2 builds, native-surface host, mode dock, and presentation CSS
- `packages/connector-host`: runtime-independent discovery, expiring approval requests, credentials, revocation, and transport; no executable or agent supervisor
- `packages/dsh-surface-plugin`: native DSH host Adapter, authorization/settings contribution, transparency, and Alt pass-through
- `packages/connector-contract`: native-surface Interface, runtime codecs, current wire contract, and capability declarations

Dependencies point inward: the extension and connector host depend on the contract; the DSH package composes the host only at build time. The WXT background is a browser composition root rather than the owner of connection or session-lifecycle rules. `pnpm check:architecture` enforces these package names, dependency edges, and source boundaries.

Future runtimes implement `SurfaceAdapter`: a runtime descriptor, native authorization URL, and `getSurface()`. Native session management and tools never move into AgentOnWeb. Codex/Claude Code would each need their own native-surface Adapter (for example, an authenticated browser terminal for a CLI); they are not implemented or routed through DSH. A protocol version/capability change is required if a future surface cannot satisfy the existing Web contract.

## Requirements

- Node.js 22.19 or newer
- pnpm 11.5 for this workspace
- Chrome 132 or newer, Firefox with temporary add-on loading, or Safari 18.4 or newer with its developer features enabled
- DeepSeek Harness `dsh-v0.1.2-alpha.3` (`@deepseek-ai/dsh@0.1.2-alpha.3`)
- `DEEPSEEK_API_KEY` available to the `dsh` process

The local `dsh` wrapper installed for this project reads `DEEPSEEK_API_KEY` from `~/.hermes/.env` at process start without copying the key into AgentOnWeb.

## Develop and run

```sh
pnpm install
pnpm install:dsh-surface
pnpm check
dsh web
```

The install command adds the bundled plugin to DSH's Web profile using DSH's own plugin manager. Its `dsh.bundle` declaration activates the additive patch automatically: no manual configuration, extra `--patch`, or separately launched companion process.

Build all three browser targets:

```sh
pnpm build:extension
pnpm build:extension:firefox
pnpm build:extension:safari
```

The unpacked outputs are:

- Chrome: `apps/extension/.output/chrome-mv3`
- Firefox: `apps/extension/.output/firefox-mv2`
- Safari: `apps/extension/.output/safari-mv2`

Load the Chrome folder from `chrome://extensions`, the Firefox manifest from `about:debugging#/runtime/this-firefox`, or the Safari folder with Safari's **Add Temporary Extension** developer command.

1. Start DSH normally with `dsh web`; keep that process running. DSH opens its own authenticated native page.
2. On a normal HTTP(S) website, AgentOnWeb opens its connection panel by default. Click **Connect** when you need it.
3. AgentOnWeb discovers local runtime plugins and opens the native workspace. Click **Allow connection** in DSH. The request expires after two minutes; **Decline** grants no access.
4. Return to your website. Subsequent connections reuse the installation credential, including after a DSH restart. No pairing code, port, or API key is entered in the extension.
5. Revoke a browser from **DSH Settings → AgentOnWeb → Revoke connection**. Reconnecting then requires fresh approval.

For this development build the extension is unpacked and the DSH package is local; neither has been published to a store/registry. Chrome packaging remains the current audited release artifact; Firefox signing and Safari's containing-app/App Store packaging are separate distribution work. Already-installed DSH, Node, and DSH's normal credentials remain prerequisites. A browser extension cannot start a stopped DSH process by itself; that would require a separately installed native host, which is outside the current product boundary.

## Modes and interaction

- AgentOnWeb is **open by default** on each normal fresh page. When disconnected, it shows the connection panel together with the collapsed 32 px AgentOnWeb dock in the lower-right corner.
- Close or **Esc** dismisses the connection panel/workspace but keeps that lower-right dock available. Background reconnects preserve the dismissed state and do not take page focus.
- Expand the lower-right dock and choose **Chill**, **Focus**, or **Watch** to reopen AgentOnWeb. While disconnected, every mode opens the same connection panel; the selected mode takes effect after a native surface is available.
- Click the **AgentOnWeb toolbar icon** or press `Control+Shift+O` on macOS (`Alt+Shift+O` elsewhere) to toggle the connection panel/workspace on the current tab. The lower-right dock remains the consistent in-page entry point. Each browser exposes its own extension-shortcut settings.
- Dismissing is independent of connection and mode: it keeps an already-mounted workspace and its native tasks alive. Reopening restores the selected mode. A workspace discovered while dismissed waits for an explicit toolbar or mode action before loading into that page.
- **Chill** is the default mode when opened and remains full-screen. DSH's native layers become highly translucent so the website stays visible behind the coding workspace.
- **Focus** keeps the same native DSH surface but places it over an opaque background.
- **Watch** keeps DSH running and mounted while hiding it, leaving the website fully interactive and a small mode dock in the lower-right corner.
- The presentation controls collapse to a single 32 px AgentOnWeb mark. Click the mark to reveal the three icon-only mode controls and Chill opacity slider.
- Switch directly to **Chill**, **Focus**, or **Watch** with `Control+Shift+1`, `Control+Shift+2`, or `Control+Shift+3` on macOS. These shortcuts also reveal AgentOnWeb on the current tab; while disconnected, they reveal the connection panel. Other platforms request `Alt+Shift+1`, `Alt+Shift+2`, and `Alt+Shift+3`. Chrome may remap conflicts at `chrome://extensions/shortcuts`.
- Double-tap **Option/Alt** in Chill to latch website click-through. Double-tap it again to return interaction to DSH. This gesture is separate from the three display-mode shortcuts.
- Chill opacity is adjustable from 20–90% in the expanded icon controls and persists across tabs and browser restarts. Focus always remains opaque; Watch remains hidden.

Mode changes are presentation-only. They do not recreate a DSH process or agent session.

Browsers isolate the native iframe's local storage for each website. The DSH plugin therefore retains a small native-view bookmark and restores it through DSH's own `sessions.open`/`openSubagent` selection Interface when entering another website or returning to a tab. It does not create sessions, send prompts, cache transcripts, or move session IDs into the extension protocol. The standalone native DSH tab keeps its own selection behavior.

Browser extensions do not receive an API for replacing the browser's Touch Bar controls. The on-screen opacity slider therefore provides the complete supported interaction. A true Touch Bar slider would require a separately focused native AppKit companion and would disappear when the browser regains focus, which does not fit AgentOnWeb's in-browser workflow.

## Security boundary

- The plugin binds only to `127.0.0.1`, in the fixed discovery range 3847–3850; there is no arbitrary network scan. The DSH host must also be loopback-only.
- Discovery reveals only runtime identity and its clean local authorization URL; no session, cookie, launch token, or API key.
- Each connection needs a random installation credential bound to its exact `chrome-extension://…`, `moz-extension://…`, or `safari-web-extension://…` origin. Only hashes are stored on disk, in a mode-0600 file.
- Initial authorization and revocation run through DSH's authenticated `/api` carrier, with its Host/Origin fence plus same-origin JSON POST validation. No wildcard CORS, auth bypass, or approval via DOM events.
- Pending requests are bounded, expire after two minutes, and are cancelled on disconnect. Authorization controls are only rendered in a top-level native DSH window, not inside website frames.
- DSH launch tokens are exchanged server-side and never reach the website.
- Signed DSH cookies remain in extension memory plus Chrome/Firefox's HttpOnly partitioned cookie store; Safari's tab-bound declarative session rule is removed on tab close, surface change, or revocation and is never persisted.
- Content scripts receive only presentation state, a clean local URL, and a per-tab frame nonce; no connector credential or DSH cookie crosses that boundary.
- Tool approvals and plugin permissions stay inside the native DSH UI.

Connection hashes are stored under `~/.config/agentonweb/deepseek-harness/connections.json`. Revocation closes connector sockets and causes the extension to drop its delegated cookies and iframe. DSH's native cookies are signed bearer sessions: a separately copied cookie remains governed by DSH's session lifetime; AgentOnWeb does not claim to revoke DSH's signing authority or unrelated native browser logins.

The DSH-only navigation bookmark is stored alongside it in `native-view.json` (mode 0600). Its authenticated native endpoint stores only a selected session ID and, where needed, DSH's subagent navigation address. Unknown/deleted sessions are not recreated, and a selection made by the user while restoration is pending takes precedence.

## Verification

`pnpm check` runs typechecking, tests, and all builds. For a lightweight presentation preview:

```sh
pnpm build:preview
pnpm preview
```

The real acceptance surface is the unpacked extension on a normal website with the normal DSH Web process running. See `docs/verification/plugin-connection.md` for the current connection contract and `docs/verification/dsh-alpha3-baseline.md` for the supported DSH boundary.
