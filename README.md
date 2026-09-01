# Overcode

**Your coding agent, everywhere.**

Overcode is a Chromium extension that presents the complete DeepSeek Harness Web workspace above the real website. It does not rebuild the agent UI or manage Harness sessions, tools, approvals, models, commands, or plugins. Those remain owned by DSH, so existing habits and Web-profile plugins continue to work in their native surface.

The website also remains the real website: Overcode does not proxy, scrape, clone, or reimplement its login, cookies, playback, DRM, history, recommendations, or controls.

## Product boundary

Overcode owns only:

- injection above normal HTTP(S) pages
- Focus, Chill, and Watch presentation
- transparency and one-gesture website pass-through
- authenticated connection to a local runtime's Overcode plugin
- secure delivery of the native Web surface (the runtime owns its process lifecycle)

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
       ├─ collapsible Pixel Seed icon controls
       └─ full-screen DSH Web iframe
            └─ native DSH UI + existing Web-profile plugins

MV3 background
  └─ authenticated loopback connector protocol v3
       └─ Overcode DSH plugin, INSIDE the existing dsh web process
            ├─ native DSH authorization + Settings → Overcode
            └─ additive transparency and Option pass-through client
```

The DSH plugin exchanges the runtime's launch token inside the local process and returns the clean surface URL plus its browser-session cookie only to the authenticated extension background. The extension installs that HttpOnly cookie in a Chrome partition scoped to each top-level website. Neither token nor signed cookie is sent to the content script or exposed to website JavaScript.

Active packages:

- `apps/extension`: MV3 background, native-surface host, mode dock, and presentation CSS
- `packages/runtime-connector`: runtime-independent discovery, expiring approval requests, credentials, revocation, and transport; no executable or agent supervisor
- `packages/dsh-surface-plugin`: native DSH host Adapter, authorization/settings contribution, transparency, and Alt pass-through
- `packages/shared-protocol`: versioned native-surface Interface and capability declarations

The older ACP/custom-overlay packages remain as inactive prototype references. They are still covered by workspace checks, but not imported by the active extension or runtime connector. The standalone Bridge package and command have been removed.

Future runtimes implement `SurfaceAdapter`: a runtime descriptor, native authorization URL, and `getSurface()`. Native session management and tools never move into Overcode. Codex/Claude Code would each need their own native-surface Adapter (for example, an authenticated browser terminal for a CLI); they are not implemented or routed through DSH. A protocol version/capability change is required if a future surface cannot satisfy the existing Web contract.

## Requirements

- Node.js 22.19 or newer
- pnpm 11.5 for this workspace
- Chrome 132 or newer with Developer mode available
- DeepSeek Harness `dsh-v0.1.2-alpha.3` (`@deepseek-ai/dsh@0.1.2-alpha.3`)
- `DEEPSEEK_API_KEY` available to the `dsh` process

The local `dsh` wrapper installed for this project reads `DEEPSEEK_API_KEY` from `~/.hermes/.env` at process start without copying the key into Overcode.

## Develop and run

```sh
pnpm install
pnpm install:dsh-surface
pnpm check
dsh web
```

The install command adds the bundled plugin to DSH's Web profile using DSH's own plugin manager. Its `dsh.bundle` declaration activates the additive patch automatically: no manual configuration, extra `--patch`, or separate Bridge process.

Build the extension:

```sh
pnpm build:extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`.

1. Start DSH normally with `dsh web`; keep that process running. DSH opens its own authenticated native page.
2. On a normal HTTP(S) website, Overcode opens its connection panel by default. Click **Connect** when you need it.
3. Overcode discovers local runtime plugins and opens the native workspace. Click **Allow connection** in DSH. The request expires after two minutes; **Decline** grants no access.
4. Return to your website. Subsequent connections reuse the installation credential, including after a DSH restart. No pairing code, port, or API key is entered in the extension.
5. Revoke a browser from **DSH Settings → Overcode → Revoke connection**. Reconnecting then requires fresh approval.

For this development build the extension is unpacked and the DSH package is local; neither has been published to a store/registry. The intended distribution is a Chrome extension plus the DSH plugin. Already-installed DSH, Node, and DSH's normal credentials remain prerequisites. Chrome cannot start a stopped DSH process by itself; that would require a separately installed Native Messaging host, which is outside this version.

## Modes and interaction

- Overcode is **open by default** on each normal fresh page. When disconnected, it shows the connection panel together with the original 32 px Overcode dock in the lower-right corner.
- Close or **Esc** dismisses the connection panel/workspace but keeps that lower-right dock available. Background reconnects preserve the dismissed state and do not take page focus.
- Expand the lower-right dock and choose **Chill**, **Focus**, or **Watch** to reopen Overcode. While disconnected, every mode opens the same connection panel; the selected mode takes effect after a native surface is available.
- Click the **Overcode toolbar icon** or press `Control+Shift+O` on macOS (`Alt+Shift+O` elsewhere) to toggle the connection panel/workspace on the current tab. The lower-right dock remains the consistent in-page entry point. The shortcut is customizable at `chrome://extensions/shortcuts`.
- Dismissing is independent of connection and mode: it keeps an already-mounted workspace and its native tasks alive. Reopening restores the selected mode. A workspace discovered while dismissed waits for an explicit toolbar or mode action before loading into that page.
- **Chill** is the default mode when opened and remains full-screen. DSH's native layers become highly translucent so the website stays visible behind the coding workspace.
- **Focus** keeps the same native DSH surface but places it over an opaque background.
- **Watch** keeps DSH running and mounted while hiding it, leaving the website fully interactive and a small mode dock in the lower-right corner.
- The presentation controls collapse to a single 32 px Overcode mark. Click the mark to reveal the three icon-only mode controls and Chill opacity slider.
- Switch directly to **Chill**, **Focus**, or **Watch** with `Control+Shift+1`, `Control+Shift+2`, or `Control+Shift+3` on macOS. These shortcuts also reveal Overcode on the current tab; while disconnected, they reveal the connection panel. Other platforms request `Alt+Shift+1`, `Alt+Shift+2`, and `Alt+Shift+3`. Chrome may remap conflicts at `chrome://extensions/shortcuts`.
- Double-tap **Option/Alt** in Chill to latch website click-through. Double-tap it again to return interaction to DSH. This gesture is separate from the three display-mode shortcuts.
- Chill opacity is adjustable from 20–90% in the expanded icon controls and persists across tabs and browser restarts. Focus always remains opaque; Watch remains hidden.

Mode changes are presentation-only. They do not recreate a DSH process or agent session.

Chrome isolates the native iframe's local storage for each website. The DSH plugin therefore retains a small native-view bookmark and restores it through DSH's own `sessions.open`/`openSubagent` selection Interface when entering another website or returning to a tab. It does not create sessions, send prompts, cache transcripts, or move session IDs into the extension protocol. The standalone native DSH tab keeps its own selection behavior.

Chrome extensions do not receive an API for replacing Chrome's Touch Bar controls. The on-screen opacity slider therefore provides the complete supported interaction. A true Touch Bar slider would require a separately focused native AppKit companion and would disappear when Chrome regains focus, which does not fit Overcode's in-browser workflow.

## Security boundary

- The plugin binds only to `127.0.0.1`, in the fixed discovery range 3847–3850; there is no arbitrary network scan. The DSH host must also be loopback-only.
- Discovery reveals only runtime identity and its clean local authorization URL; no session, cookie, launch token, or API key.
- Each connection needs a random installation credential bound to its `chrome-extension://…` origin. Only hashes are stored on disk, in a mode-0600 file.
- Initial authorization and revocation run through DSH's authenticated `/api` carrier, with its Host/Origin fence plus same-origin JSON POST validation. No wildcard CORS, auth bypass, or approval via DOM events.
- Pending requests are bounded, expire after two minutes, and are cancelled on disconnect. Authorization controls are only rendered in a top-level native DSH window, not inside website frames.
- DSH launch tokens are exchanged server-side and never reach the website.
- Signed DSH cookies remain in extension memory and Chrome's HttpOnly partitioned cookie store.
- Extension credential storage is restricted to trusted extension contexts. Content scripts receive only presentation state, a clean local URL, and a per-tab frame nonce.
- Tool approvals and plugin permissions stay inside the native DSH UI.

Connection hashes are stored under `~/.config/overcode/deepseek-harness/connections.json`. Revocation closes connector sockets and causes the extension to drop its delegated cookies and iframe. DSH's native cookies are signed bearer sessions: a separately copied cookie remains governed by DSH's session lifetime; Overcode does not claim to revoke DSH's signing authority or unrelated native browser logins.

The DSH-only navigation bookmark is stored alongside it in `native-view.json` (mode 0600). Its authenticated native endpoint stores only a selected session ID and, where needed, DSH's subagent navigation address. Unknown/deleted sessions are not recreated, and a selection made by the user while restoration is pending takes precedence.

## Verification

`pnpm check` runs typechecking, tests, and all builds. For a lightweight presentation preview:

```sh
pnpm build:preview
pnpm preview
```

The real acceptance surface is the unpacked extension on a normal website with just the normal DSH Web process running. See `docs/verification/plugin-connection.md` for the requirement-by-requirement audit and `docs/verification/dsh-alpha3-compatibility.md` for the latest DSH architecture compatibility evidence.
