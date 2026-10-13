# Terminal mode shortcuts and focus — 2026-10-13

Terminal input now forwards enabled default mode shortcuts through the same background path as browser commands: Control+1/2/3 on macOS and Alt+1/2/3 on Windows/Linux. The extension sends the terminal its current enabled defaults, derived from `commands.getAll()`. Cleared or remapped defaults are released; custom bindings remain handled by browser commands. Both frame boundaries validate source, origin and nonce.

Explicit Focus actions focus the native terminal input, Chill preserves the current focus, and Watch restores the most recently focused website control. Deleted controls fall back to the document body. Ordinary state updates do not refocus the terminal. Chrome's late focus of the intermediate extension document after hiding its native child is returned to the website while Watch remains active. Shortcut refreshes replace cached bindings atomically so rapid focus transitions cannot temporarily drop keys.

## Regression checks

The new tests first failed on the previous implementation. The three affected test files now pass all 55 tests, covering terminal input routing on macOS and Windows, ordinary/composing/repeated keys, configured defaults, authenticated messages, pending binding refreshes, wrapper readiness, focus preservation and Watch restoration.

`pnpm check` passed: **326 passed, 1 skipped** across 52 test files, plus privacy, architecture, TypeScript, Chrome/Firefox/Safari builds, browser manifest checks and Safari WKWebExtension validation. The skipped test is the existing optional installed-DSH HTTP bridge test. `git diff --check` passed.

## Real browser verification

Passed in visible Chrome for Testing **156.0.8078.4**, on **2026-10-13 12:00:12–12:00:16 Asia/Shanghai**. The runner loads the current unpacked extension and an isolated copy of the built terminal host with a real `/bin/sh` PTY. It uses a fresh browser profile and actual browser focus rather than Playwright focus emulation.

- Control+1/2/3 works with the real xterm textarea focused.
- Chill preserves either terminal or website focus; Watch restores the website; Control+2 returns to native terminal input without a mouse.
- Five rapid keyboard-only mode cycles pass. No mode-key bytes reach the PTY.
- Fifteen background presentation updates preserve terminal focus. A subsequent shell command produces the expected `AOW_MODE_KEYS_OK` output.
- All 26 switches in this run use the iframe/page fallback. The injected browser keyboard events do not dispatch `commands.onCommand`, so this verifies the failure path independently of browser-command delivery.
- The report confirms cleanup of the test browser, host, profile and temporary host files.

Reproduce after `pnpm build`:

```sh
node scripts/check-terminal-mode-focus-browser.mjs \
  --deps /path/to/prefix-containing-node_modules-playwright-core \
  --chromium '/path/to/Google Chrome for Testing'
```

The runner records `report.json`, `watch-website-focus.png` and `focus-terminal-input.png` under ignored `output/terminal-mode-focus/`. It disables native messaging only in the copied test manifest to avoid changing machine-wide pairing, then uses the real manual-approval flow.

## Delivery boundary

This is a local implementation and real Chrome verification. The user's installed extension and terminal service were not replaced. Firefox/Safari builds passed; their browser runtime behavior was not tested in this task. Shipping this change requires both the browser extension and terminal-host package, which bundles the terminal frontend. No commit, PR or release is included.
