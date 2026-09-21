# Local workspaces in the browser

AgentOnWeb displays workspaces from local processes on ordinary websites. The extension controls presentation and connection authorization. It does not run a shell in the page, copy an existing desktop terminal window, or provide an AI runtime of its own.

## Runtime paths

| Path | Owns execution | Owns the interface | Starts with |
| --- | --- | --- | --- |
| Local terminal | A local host and its PTY-backed shells | `apps/terminal-surface` using xterm | `aow terminal` or the macOS `aow service install` |
| DSH | `dsh web` | DSH's native Web UI and surface plugin | `dsh web` with `@agentonweb/dsh-surface` installed |

The local terminal launches a new interactive login shell in the user's home directory. Shell startup files may change that directory and environment. Users run their own commands, including `codex`, from the shell. No Codex installation is required for the host itself, and no model or CLI permissions are selected by AgentOnWeb.

## Packages

| Package / directory | Responsibility |
| --- | --- |
| `apps/extension` | Discovery, remembered runtime credentials, per-tab workspace selection, authorized iframe wrappers, browser cookie/header delivery, Chill/Focus/Watch |
| `packages/connector-contract` | Runtime descriptors and the versioned discovery/authorization/surface protocol |
| `packages/connector-host` | Loopback connector and persisted browser grants; shared by DSH and the terminal host |
| `packages/dsh-surface-plugin` | DSH-owned authorization, native UI integration and bounded navigation bookmark |
| `packages/terminal-core` | PTY lifetime, canonical terminal state, output snapshots, backpressure and one active input controller |
| `apps/terminal-surface` | Browser terminal, terminal selection, input/resize, presentation and private setup UI |
| `packages/terminal-host` | Shell launch, terminal HTTP/WebSocket server, pairing management and macOS service lifecycle |

The terminal runtime ID is `terminal`. `@agentonweb/terminal-host` launches the user’s shell; installed CLI tools run inside that shell.

## Process and connection lifetime

A host owns up to eight shells. Viewers attach to a shell's canonical headless terminal snapshot and then receive ordered output. Detaching a viewer, closing the overlay, refreshing a page or switching runtimes does not stop the shell. One viewer owns input and resizing; explicit takeover invalidates the preceding input lease. Input is not replayed after an uncertain disconnect. Binary terminal events preserve their bytes separately from Unicode text.

The terminal toolbar can create or close shells. A shell's `exit` ends its process while leaving its final output available until closed. Stopping the host, uninstalling its service, logging out or rebooting ends its live processes. Terminal screens and running processes are not restored from disk; individual tools may provide their own saved-session recovery.

## Local authorization

Connectors listen on IPv4 loopback, using discovery ports 3847–3850. The terminal HTTP server uses a dynamically assigned loopback port and validates Host. WebSockets require the exact local Origin, an authenticated cookie and a single-use expiring ticket bound to a terminal. The embedded UI waits for its authorized extension wrapper before attaching.

Only the private one-time setup link sets the terminal administrator cookie. It permits approval and revocation. The extension receives a separate delegated terminal cookie; it cannot approve another browser. The setup link and connection-grant hashes live under `~/.agentonweb/terminal/`; the extension stores its own reconnect credentials locally.

Chrome/Firefox delegate through partitioned cookies. Safari uses temporary tab-and-runtime-scoped header rules for embedded views; native top-level management pages retain their administrator cookies. Revocation invalidates the shared terminal surface secret and its tickets, disconnects terminal viewers, and asks remaining authorized connectors to reconnect for a fresh surface credential. Other browser grants remain valid; DSH has its own authorization and is unaffected.

## Build and verification boundary

The terminal host bundles internal workspace code and the terminal HTML/JS/CSS. Its installed runtime dependencies include `node-pty`, xterm headless/serialization and `ws`. The installer fixes the bundled PTY helper's executable permission where needed.

`pnpm check` covers code and browser builds. `pnpm release:audit` also checks reproducible archives, packed documentation/assets, isolated imports and an installed terminal host with a real shell. Live terminal acceptance is currently macOS/Chrome; unit tests and generated Firefox/Safari manifests are not live platform acceptance. Dated records under `docs/verification/` describe the specific build tested, with current implementation and acceptance evidence.
