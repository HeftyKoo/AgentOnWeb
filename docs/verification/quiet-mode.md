# Default-open connection panel with a persistent dock

Verified on 2026-09-01. This change separates the dismissible panel/workspace from the persistent lower-right dock and the shared runtime connection/mode.

## Behavior

- Each normal fresh document opens Overcode by default. Disconnected pages show the setup panel and the original collapsed 32 px dock.
- Close and panel Escape dismiss the panel/workspace while preserving the dock. The dock has no extra Hide control. Website/native-iframe Escape is untouched.
- Choosing Chill, Focus, or Watch in the dock activates Overcode. With no native surface, every mode reveals the setup panel.
- The toolbar action and its `_execute_action` shortcut toggle only the selected tab. Defaults: Control+Shift+O on macOS, Alt+Shift+O elsewhere. Existing mode shortcuts reveal the selected tab and show setup when disconnected.
- Dismissing preserves an already-mounted iframe and does not disconnect, cancel, or create a native task. A workspace discovered while dismissed waits for explicit activation before loading.
- Disconnect/reconnect updates preserve a user's dismissed state. A delayed initial snapshot cannot overwrite a newer explicit activation or state update.
- A disconnected Focus mode has a transparent shell, so its connection card does not replace the entire website with an opaque background. Native approval pages remain exempt from the overlay.

## Automated verification

`pnpm check`: typechecking, 44 tests across 12 files, and all workspace builds passed. `pnpm build:preview` and `git diff --check` also passed.

`apps/extension/src/content.test.ts` bundles the production content entry with its real CSS, assets, dock, and **closed** Shadow DOM. Only the Chrome messaging transport is mocked; jsdom does not load remote resources. It checks default-open setup/dock behavior, all three disconnected modes, delayed initial replies, dismiss/reconnect, iframe-source stability, focus restoration, Escape scope, Watch setup, and native-page exclusion.

`apps/extension/src/background.test.ts` additionally checks that toolbar activation targets one tab without changing the selected mode or starting a connection, that mode shortcuts reveal only the active tab, and that restricted Chrome pages are ignored.

## Browser verification and limits

The local `artifacts/quiet-mode/` fixture served the built `apps/extension/dist/content.js` in the in-app Chromium browser. Connection events and the native workspace were explicit test fixtures, not an actual DSH connection. Verified:

- Setup and the collapsed lower-right dock appear at initial load.
- Close and panel Escape dismiss the setup while the lower-right dock remains. Simulated reconnect then connected updates preserve the dismissed state and leave a fresh iframe unloaded.
- Choosing any mode while disconnected reopens setup. Reopening after connection mounts the workspace. Text entered into its textarea survives dismissing and reopening.
- Escape inside the workspace reaches its own handler without hiding Overcode.
- Refresh returns to the default-open setup; disconnected Focus leaves the surrounding website visible.

The browser tool sends synthetic events to the outer host of a closed Shadow DOM. Therefore the **browser fixture only** opens the shadow tree so those tools can target its controls; the shipped bundle retains closed isolation, which is independently covered by the automated tests. This is not a live installed-extension or physical-shortcut acceptance claim.

Local screenshots: `artifacts/quiet-mode/01-default-open.png`, `02-dismissed-dock.png`, and `03-mode-reopens-setup.png`. They and the fixture are ignored artifacts, not release assets.

The browser tool prohibited opening Chrome's extension manager. No alternate route was used to reload the installed extension. To activate this local build, reload Overcode in Chrome's extension manager, then refresh the target website. Actual Chrome toolbar/shortcut dispatch and the existing authorized DSH session still need that installed-build check. No extension permissions, credentials, runtime session, or publishing state were changed.
