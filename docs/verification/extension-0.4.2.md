# Extension 0.4.2

Prepared October 29, 2026 for Chrome and Firefox. The extension adds a draggable
floating launcher with persistent normalized coordinates, click/drag separation,
cancelled-gesture rollback and viewport-aware placement of controls and notices.

`pnpm release:audit` passed with 427 tests passed and two optional tests skipped
across 57 test files. Privacy, architecture, TypeScript, Chrome/Firefox/Safari
builds, Safari WebKit validation, reproducible archives and isolated terminal
package installation with real shell input/output passed.

The implementation was also verified in real Chrome on October 22: mouse and
touch dragging across an iframe, exposing a covered page control, no accidental
click after dragging, extension-storage persistence, cross-page and reload
restoration, menu placement at corners and center, and window resizing.

Chrome and Firefox use extension version 0.4.2. Safari source metadata is
prepared as 0.4.2, build 11, but Safari submission is outside this release.
Terminal host 0.4.3, DSH 0.4.0 and connector protocol 1 remain unchanged.

Publish the reviewed main commit under `ext-v0.4.2`. Upload the Chrome MV3 ZIP
to the Chrome Web Store and the Firefox MV2 ZIP with its matching source archive
to Firefox Add-ons. Verify each store's processed version and review/public
state independently; a successful upload does not establish public availability.
