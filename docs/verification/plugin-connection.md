# Runtime connection contract

## Release baseline

- WXT Chrome, Firefox, and Safari extension: `0.1.0`
- DSH surface plugin: `0.1.0`
- Connector protocol: `v1`

Package versions describe independently published artifacts. The handshake depends only on the connector protocol version.

## Components

- `apps/extension` discovers local runtime plugins, requests native authorization, delegates the runtime session through the browser-specific lease, and presents the native surface above normal websites.
- `packages/connector-host` owns loopback discovery, approval requests, credential authentication, revocation, and the two protocol commands: `surface.get` and `connection.ping`.
- `packages/dsh-surface-plugin` runs inside `dsh web`, exposes the authenticated DSH surface, renders authorization controls in native DSH slots, and retains the bounded native-view bookmark.
- `packages/connector-contract` defines and validates the complete protocol-v1 wire contract and runtime capabilities.

## Connection lifecycle

1. The extension probes the fixed loopback range `127.0.0.1:3847-3850` and validates the runtime descriptor and authorization URL.
2. Discovery exposes runtime identity and capabilities only; it cannot return a session cookie or credential.
3. A first connection creates a two-minute pending request and opens the native DSH page.
4. Decline issues no credential. Allow creates a random credential bound to the extension origin and stores only its hash on disk.
5. The authenticated extension requests `surface.get` and receives the clean DSH URL plus delegated cookie. Chrome and Firefox install an HttpOnly cookie in the current website's partition; Safari installs a session-only declarative header rule scoped to the mounted tab and exact localhost surface.
6. Restart and reconnect reuse the stored installation credential. Revocation closes active sockets, clears delegated cookie/header leases, and requires a new native approval.

The content script never receives the installation credential, delegated cookie, DSH launch token, arbitrary endpoint configuration, or session transcript.

## Native surface behavior

- DSH owns sessions, tools, approvals, models, commands, settings, and installed Web-profile plugins.
- Overcode owns Focus, Chill, Watch, opacity, the collapsible dock, and double-Option website pass-through.
- Closing the panel does not disconnect or recreate the iframe.
- A small `native-view.json` bookmark restores DSH's selected session or subagent across website storage partitions. It stores no transcript, credential, or execution state.
- Authorization controls are available only in a top-level native DSH window, never inside the embedded website iframe.

## Security invariants

- Loopback-only listener and fixed discovery ports
- Exact Chrome, Firefox, or Safari extension Origin plus connector Host validation
- Exact protocol-v1 handshake with no alternate protocol parser
- Five-second handshake timeout and bounded frame size
- Two-minute approval expiry and duplicate-request limits
- Origin-bound random credentials with hash-only mode-0600 persistence
- DSH Host/Origin plus same-origin JSON validation for authorization mutations
- HttpOnly, Secure, partitioned delegated cookies in Chrome/Firefox; non-persisted tab-bound declarative session rules in Safari
- Authorization recheck after asynchronous surface acquisition

## Verification

`pnpm check` must pass TypeScript project checks, all Vitest files, all three WXT targets, generated-manifest assertions, and native Safari `WKWebExtension` parsing on macOS. The plugin package must contain only:

- `package.json`
- `cordis.patch.yml`
- `lib/index.js`
- `lib/host.js`
- `lib/client.js`

Importing the extracted package from outside the workspace must succeed without workspace dependencies. End-to-end acceptance loads each unpacked browser target on a normal HTTP(S) website with the pinned DSH runtime running.

## Current boundary

DSH must already be installed, configured, and running. The extension cannot start a stopped local process. Native Messaging, source-build onboarding, prompt translation, transcript storage, and an independent agent manager are outside the current product.
