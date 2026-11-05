# Terminal performance — 2026-11-05

Initial scope: local source/build validation. No installed host restart, extension reload
in the user's browser, commit, package publication or release was performed.
Existing user terminal sessions were preserved.

## Reproduction and findings

The real terminal-surface bundle was served by a local HTTP fixture. Only the
host transport was replaced. CPU throttling was fixed at 4×. The final Chill
checks use 3,000 varying, densely colored history lines at 140×48, actual mouse
wheel events and dragging the native scrollbar. Playwright's default hidden
scrollbars are disabled in the fixture; tests assert that the viewport actually
moves through history. Interaction timings include dispatch plus two animation
frames, while typing timings measure key dispatch completion, not a complete
browser-to-PTY echo round trip. Timings vary by machine and browser load.

| Chill metric (p95) | DOM path before | Final WebGL path |
| --- | ---: | ---: |
| Wheel response | 197 ms | 61 ms |
| Wheel frame interval | 117 ms | 17 ms |
| Scrollbar drag response | 271 ms | 43 ms |
| Scrollbar drag frame interval | 133 ms | 33 ms |

The final GPU run recorded zero main-thread long tasks for both interactions
(the DOM run recorded 24/33). With continuous output while reading history,
wheel/drag response p95 remained 62/47 ms, both frame p95 values were 17 ms,
and neither interaction was pulled back to the bottom. The benchmark enforces
100 ms interaction and 50 ms scroll-frame budgets. The DOM baseline is the same
bundle with WebGL disabled, exercising the previous Chill render path.

The initial full-screen redraw workload reproduced 134 ms Focus / 179 ms Chill
keyboard p95. Removing history still reproduced 112 ms / 146 ms, isolating dense
visible redraws as a sufficient trigger. At the same 140×48 size, the final
continuous full-screen output test measured 4 ms Focus / 3 ms Chill keyboard
p95 and 17 ms frame p95 in both modes, with all 24 typed characters delivered in
order and zero long tasks. Scrollback remains 3,000 lines; it was not reduced to
obtain these improvements. GPU-disabled environments still use the slower DOM
fallback, so these figures are not a guarantee for every device or workload.

CPU profiling identified the per-render cell-opacity scan and DOM row rebuilding
as hot paths. Both modes now retain one GPU canvas. A small compatibility bridge
for the pinned xterm 5.5.0 / WebGL addon 0.18.0 adjusts only background vertices,
splitting merged rectangles at selection and wide-cursor boundaries. The GPU
layer is cleared and uses separate RGB/alpha blending to avoid double-painting
the CSS background or multiplying alpha by itself. Screenshot pixel comparisons
with DOM at 0.4, 0.2 and opaque settings agree within 3/255 per channel. Text,
selection and cursor stay opaque. Restoration reattaches the bridge to the new
draw objects; unrecoverable context loss restores a usable translucent DOM view.
Duplicate presentation updates do not rebuild themes or the GPU context.

The host regression fixture also reproduced 8,002,000 queue-entry visits while
acknowledging 4,000 outstanding output frames. Ordered draining now requires at
most 8,000 visits. The browser coalesces cumulative ACKs per parser turn and writes
large snapshots/output in chunks of at most 8,192 UTF-16 units without splitting
surrogate pairs. Typing is sent immediately. Redundant PTY pause/resume calls and
unchanged viewport broadcasts are suppressed.

## Commands and acceptance

```sh
pnpm --config.verify-deps-before-run=false check
node scripts/check-terminal-performance-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN"
node scripts/check-terminal-performance-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN" --scroll --columns 140 --rows 48
node scripts/check-terminal-performance-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN" --scroll --live --columns 140 --rows 48
node scripts/check-terminal-presentation-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN"
node scripts/check-terminal-copy-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN"
node scripts/check-terminal-copy-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN" --dom
node scripts/check-terminal-copy-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN" --chill
node scripts/check-terminal-copy-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN" --chill --dom
node scripts/check-terminal-mode-focus-browser.mjs --deps "$PLAYWRIGHT_PREFIX" --chromium "$CHROMIUM_BIN"
```

- Full check: 441 tests passed, 2 intentionally skipped; privacy/architecture,
  TypeScript, Chrome/Firefox/Safari builds and Safari native validation passed.
  Dependency auto-install was disabled for this run after tightening the xterm
  version range; installed dependency resolutions were unchanged.
- Real Chrome copy checks passed in both WebGL and forced DOM paths: mouse
  reporting off/1000/1002/1003, direct drag, reverse Chinese selection, right-click
  copy, double-click word selection and native TUI click/wheel forwarding.
- Chrome for Testing 156.0.8078.4 with an isolated unpacked extension and actual
  PTY passed keyboard-only Focus/Chill/Watch transitions, five repeated mode
  cycles, 15 background presentation updates without lost focus, and shell input.
- Unit coverage checks renderer failure/context loss, no-op presentation, cell
  opacity and selection, Unicode snapshot chunks, cumulative ACK ordering and
  cancellation, shared input, slow viewers, PTY watermarks and viewport deduping.
- `git diff --check` passed. No debug logging was retained.

The browser fixture accepts `--assets` for a baseline bundle, `--profile` for a
CPU profile, `--scroll`/`--live`/`--dom` for interaction comparisons, and
`--columns`, `--rows`, `--history` for further stress cases. Timing
budgets are a manual performance check; deterministic queue/work-count
regressions run in the ordinary test suite.

## Terminal host 0.4.4 release preparation

The release preparation reran `pnpm install --frozen-lockfile` and
`pnpm release:audit` with terminal host 0.4.4, extension 0.4.2 and DSH 0.4.0.
All 441 tests passed, with two optional integration tests skipped. Privacy,
architecture, TypeScript, Chrome/Firefox/Safari builds, Safari native validation,
reproducible archives and isolated production installation passed. The packed
host passed Claude/Pi install/uninstall, authenticated assets and real shell I/O.

Chrome for Testing 156.0.8078.4 release-build checks passed at 140×48 under 4×
CPU throttling: Focus/Chill typing p95 was 4/3 ms, and continuous-output Chill
wheel/scrollbar-drag p95 was 61/49 ms. Frame p95 was 17 ms with zero long tasks.
The GPU/DOM pixel comparison, context restoration/loss, Chill GPU and DOM copy
checks, and isolated extension/PTY keyboard mode checks all passed again.
The user's installed host and live terminal sessions were preserved.

These are pre-publication checks. Public npm installation and release checksums
must be verified after the tag workflow publishes the package.
