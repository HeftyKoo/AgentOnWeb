# Terminal mouse selection — 2026-10-20

## Behavior

Mouse and trackpad drags select text without modifier keys, including when a
native TUI enables mouse reporting. Right-click prepares the selected text for
the browser's Copy menu item; existing copy shortcuts remain available.
Double/triple clicks use xterm's word/line selection. Single clicks and scrolling
continue to reach the TUI. Modified gestures retain xterm's existing behavior.

Previously, xterm disabled ordinary selection during mouse reporting. On macOS,
its Option selection override was also disabled. The surface now delays a plain
left-button press until it can distinguish a click from a drag. Drags enter
xterm's own selection path; clicks forward the original press and release.
Scrollbar gestures bypass this handling. Pointer presses also cancel a pending
Option tap so selection cannot accidentally trigger the double-Option shortcut.

## Validation

- 67 focused tests passed across terminal input, selection, presentation,
  extension content and native-surface wrappers. Both platform selection
  branches, small trackpad movement, canceled gestures, modified gestures,
  scrollbar interaction and Option-tap behavior are covered.
- TypeScript, the terminal-host build, architecture checks and `git diff --check`
  passed.
- Real visible Chrome passed direct dragging, reverse Chinese selection,
  right-click copy preparation and system clipboard contents with mouse
  reporting off and modes 1000, 1002 and 1003 enabled. TUI click/release and wheel
  reports, plus double-click word selection, also passed. The browser Copy
  command is invoked with `document.execCommand("copy")` after right-click;
  the OS context-menu item itself is not automated.
- The browser runner uses the actual built terminal UI and xterm, replacing
  only HTTP/WebSocket host transport with a fixture. It uses an isolated browser
  profile, restores the previous text clipboard and closes its browser/server.

Reproduce after building the terminal surface:

```sh
node scripts/check-terminal-copy-browser.mjs \
  --deps /path/to/prefix-containing-node_modules-playwright-core \
  --chromium '/path/to/Google Chrome for Testing'
```

## Delivery boundary

This record covers the local fix and validation. The installed service and
extension were not replaced or restarted. Publication is tracked separately in
[the patch release record](release-0.4.2.md). Live Firefox/Safari/Windows/Linux
acceptance is not included.
