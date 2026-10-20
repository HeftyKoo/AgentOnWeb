# Terminal host 0.4.2 and extension 0.4.1

Prepared October 20, 2026. Safari uses 0.4.1, build 10; DSH remains 0.4.0
and connector protocol remains 1. See the changelog for changes since the
previous independent artifact releases.

`pnpm release:audit` passed: 393 tests passed, one existing optional test skipped
across 57 test files. Privacy, architecture, TypeScript, Chrome/Firefox/Safari
builds, Safari native validation, reproducible archives and isolated terminal
package installation with real shell input/output passed.

Direct text dragging, reverse Chinese selection, right-click copy preparation,
clipboard contents, TUI clicks/scrolling and word selection passed in real
Chrome. The detailed scope and reproducible runner are recorded in
[terminal copy verification](terminal-copy-2026-10-20.md).

The copy fix requires terminal host 0.4.2. Updating only the browser extension
does not install the terminal frontend. Finish active shells before `aow update`.
Publication and each store's processed/review/public state must be verified
separately after merging; an audit or package upload alone is not publication.
