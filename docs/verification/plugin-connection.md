# DSH plugin connection acceptance

Date: 2026-08-31. Status: local plugin migration accepted; automated checks and the final live revoke/re-pair cycle passed. Not a store/registry release.

## Scope and source of truth

Current goal: “保留一键配对授权，其他的按照上面的讨论去做”. The requested distribution is a Chrome extension plus an Overcode plugin loaded by normal `dsh web`, retaining a first-time native authorization action.

The original objective attachment and all nine turns of “DeepSeek Harness形态解释” were read. The enduring product requirements are “Your coding agent, everywhere”, a real underlying website, coding-first full-screen Chill, easy website interaction, and runtime independence. Later explicit instructions supersede the original custom-chat/ACP/runtime-manager design: use the agent's native interaction and plugins; make controls minimal and collapsible; double Option is specifically the website pass-through gesture, not every shortcut. The present change does not restore the rejected custom agent UI or a separately launched Bridge.

Local implementation is authoritative. DSH is pinned to `dsh-v0.1.2-alpha.1`, source commit `cd5ef8148158c3a752a658978873241fdf8e2bbc`. The extension is an unpacked local 0.3.0 build; the DSH plugin is a local 0.2.0 package. Neither has been published to a registry/store.

## Requirement audit

| Requirement | Evidence | Result |
| --- | --- | --- |
| Normal DSH startup, no separate Bridge | `pnpm install:dsh-surface` uses DSH's plugin manager; the package declares `dsh.bundle`. Normal `dsh web` loaded the plugin without `--patch`. Native Web and connector listeners share one PID; after the latest restart PID 13555 owned loopback ports 3080 and 3847. | Verified |
| No manual code, endpoint, or API key in the extension | Content setup contains Connect/approval actions and optional runtime selection, with no credential input. The local wrapper continues reading the existing Hermes key at DSH startup. | Verified |
| Explicit first authorization in native DSH | Live first connection opened the native DSH page; Decline displayed a denial and issued no grant, and Allow connection enabled the iframe. Settings → Overcode currently lists the bound extension. Tests independently prove that discovery and pending requests cannot retrieve a surface. | Verified |
| Native interactions and existing plugins | Real DSH sidebar, workspace selector, model/permission controls, chat, trajectory and settings are rendered by DSH. Its native tool flow ran `pwd` and returned `OVERCODE_PLUGIN_OK`. The plugin adds only authorization/settings slots, theme overrides in embedded mode, and a native-view bookmark. | Verified for the tested Web profile; not a certification of every third-party plugin |
| Full-screen Chill, visible website, minimal collapsible controls | Real Chrome screenshot `artifacts/plugin-connection/chill.png`: full native workspace, underlying IANA content visible at the user's preserved 23% opacity, short icon dock. `focus.png`: opaque full-screen native workspace and collapsed logo. | Verified |
| Ordinary per-mode shortcuts | Real `Control+Shift+1/2/3` switched Chill/Focus/Watch. Mode changes leave the same iframe/session in place; no runtime command creates/cancels a session. | Verified |
| Double Option only for website pass-through | Latch tests cover paired timing, late taps and reset; native client test covers one event per press, repeat suppression and nonce/source validation. CSS switches pointer events only for the pass-through latch. | Automated path verified; physical modifier-only gesture not re-driven by Computer Use |
| Real website interaction | In Watch, clicked IANA's own Reserved Domains link; the original page navigated normally. No site provider, proxy, replacement login or video implementation is used. | Verified on IANA/example sites; no universal DRM/fullscreen-site claim |
| Reload/reconnect without another code | Reloaded the unpacked extension and restarted normal DSH; the existing authorization reconnected. The selected native test session and opacity remained available. Background tests cover cold-start saved credentials and the persistent reconnect alarm. | Verified; an actual Chrome process restart/long suspension was not forced |
| Same native session after changing website | Initial live test found that a new Chrome storage partition selected New Session. Fixed in the DSH plugin using its public native selection Interface. Re-tested example.com → example.net: same `OVERCODE_PLUGIN_OK check pwd` session and tool result opened automatically. See `cross-site.png`. | Verified after fix |
| Do not implement another agent manager | Generic protocol commands are only `surface.get` and `connection.ping`. DSH bookmark synchronization calls native selection/refresh, never create, prompt, approval, execution or cancellation. No transcripts are stored by Overcode. | Verified by active import/command inspection |
| Future runtime extensibility | `SurfaceAdapter` declares runtime identity, Web surface capabilities, native authorization URL, and surface acquisition. Connector tests run a non-DSH test Adapter. DSH selection/auth integration stays entirely inside the DSH package. | Verified architecture; Codex/Claude adapters intentionally not implemented |
| Strong local trust and secrets isolation | Loopback-only listeners, exact Host/extension-origin checks, versioned handshake, 2-minute pending expiry, bound random credentials, hash-only 0600 storage. DSH guards native routes. Background tests verify credential/cookie values never enter content-script state and cookies are HttpOnly/partitioned. | Verified automated checks and live unauthenticated 401/cross-origin 403 checks |
| Revoke stops access and requires fresh authorization | After the user's explicit confirmation, native Revoke connection reduced grants from one to zero. The example.net iframe disappeared and displayed “Connection authorization was revoked in the runtime.” A page reload did not restore access. Connect reopened native DSH; Allow connection restored one grant and automatically reopened the original session and tool result. Tests additionally cover in-flight delivery and cold-start cookie cleanup. | Verified live and automated |
| Documentation and clean output boundary | README describes installation, prerequisites, connection/revocation, limitations and runtime Interface. Generated builds, QA screenshots and runtime/environment state are ignored. No commit, push or publication was performed in this goal. | Verified |

## Checks

`pnpm check` runs TypeScript project checks, Vitest, and all workspace builds. The full command passed after the native-view fix and was rerun after the live authorization cycle: 11 files / 34 passing tests, typechecking and all workspace builds. `git diff --check` also passed. The live authorization result below is separate evidence, not an inference from these automated results.

The DSH package was also packed with `pnpm --filter @overcode/dsh-surface pack` and extracted into a fresh directory outside the workspace. The archive contains exactly `package.json`, `cordis.patch.yml`, and `lib/{index,host,client}.js`. Importing its host entry from that isolated directory succeeded without workspace dependencies. The package retains its `dsh.bundle` automatic-activation declaration. This verifies the package payload/entrypoint, not a published-registry installation; the installed live profile still uses the local development package.

Relevant test files:

- `packages/runtime-connector/src/authorization.test.ts`: durable origin-bound credentials, decline/cancel/shutdown, TTL expiry.
- `packages/runtime-connector/src/server.test.ts`: non-DSH Adapter, discovery, authorization gate, protocol/origin rejection, reconnect/revoke and in-flight revoke race.
- `apps/extension/src/background.test.ts`: privileged-message isolation, trusted-only storage, secret-free content state, cold-start cookie cleanup and reconnect alarm.
- `packages/dsh-surface-plugin/src/host.test.ts`: DSH's actual `http://dsh.internal` Fetch bridge placeholder versus validated Host/Origin headers.
- `packages/dsh-surface-plugin/client.test.ts`: native slots versus iframe isolation, presentation message authentication, cross-partition native selection and in-flight user-choice precedence.
- `packages/dsh-surface-plugin/src/view-state.test.ts`: bounded native-only bookmark, private persistence, empty selection and subagent addresses.
- Extension interaction/surface-cookie tests: double-Option latch, opacity clamps, isolated cookie details.

Screenshots are local-only ignored artifacts, not source or release assets. No API key, connection credential, signed cookie or DSH launch token is included in this document.

## Final live gate and boundaries

The user confirmed the temporary revocation/re-pair test. It passed in the existing visible Chrome session: revoke → zero grants and no website iframe → refresh still denied → Connect → native DSH Allow connection → one grant and the original `OVERCODE_PLUGIN_OK check pwd` session restored. No pairing code, port, API key or second Bridge startup was entered. Session/project files were not deleted. The browser is left authorized and usable.

Local screenshots: `artifacts/plugin-connection/revoked.png`, `reapproval.png`, and `reconnected.png`. When DSH Settings is open, its modal has the foreground Allow connection action; the duplicate shell-overlay card remains behind that modal. The successful reauthorization used the Settings action.

DSH must remain running; an extension alone cannot launch a stopped local process. Native Messaging is not included. DSH's own session-cookie lifetime is separate from Overcode authorization: clearing delegated browser cookies is not a promise to invalidate a separately copied native bearer cookie. Original top-level websites and unrelated browser tabs/configuration are not reset by this workflow.
