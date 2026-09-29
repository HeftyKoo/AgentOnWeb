# DSH embedded authentication regression (2026-09-26)

## Diagnosis

The reported text, `dsh web authentication required; reopen the URL printed by dsh web.`, is a DSH HTTP 401 response. It comes from `BrowserAuth.writeUnauthorized()` after `authorizeIndex()` cannot authenticate a root/index request. AgentOnWeb connector approval is a separate grant; it does not make an invalid browser cookie valid.

The relevant upstream code is [browser-auth.ts at dsh-v0.1.5-rc.3](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.3/packages/client/connection/src/browser-auth.ts). The installed `0.1.2-alpha.3` implementation has the same first-cookie selection behavior.

Without a valid root launch token, DSH rejects missing cookies, malformed values, invalid signatures, a different hostname/port, expired cookies, future issue timestamps, or an interval exceeding its configured lifetime. `localhost` and `127.0.0.1` are different authorities. Restarting with the same signing secret normally preserves valid cookies; replacing the signing secret does not.

One concrete trigger was reproduced in Chrome: an old unpartitioned localhost cookie and a newly delegated partitioned cookie share DSH's deterministic cookie name. The embedded HTTP request sends the old value first. DSH's `cookieValue()` returns that first value without checking the later valid cookie. Repeating connector approval leaves the conflicting first-party cookie in place.

This is a verified trigger matching the reported screenshot. The reporting user's browser/version and cookie state were unavailable, so it is not proof of their exact environment.

## Evidence

DSH `0.1.2-alpha.3` and npm `latest` (`0.1.5-rc.3` when queried) were tested in isolated runtime homes with Chrome for Testing `147.0.7727.15`. The regular local DSH installation and process were preserved.

| Request | Result |
| --- | --- |
| Current signed cookie alone | HTTP 200 |
| Invalid old cookie followed by current cookie of the same name | HTTP 401 |
| Current cookie followed by invalid old cookie | HTTP 200 |
| Original extension cookie delegation with an existing old first-party cookie | HTTP 401 and the exact reported text |
| Fixed extension with the old first-party cookie retained | HTTP 200; authenticated API requests and WebSocket handshake succeed |

The initial reproduction command was `node /private/tmp/aow-dsh-auth-repro/repro.mjs latest stale-first-party`. Its failing assertion reported `statuses: [401]`, `authError: true`, and the exact error text. A temporary server-side probe confirmed that the browser sent both same-name cookies, old first. The retained regression below uses the actual connector, approval store, extension background/content scripts, and native iframe instead of that temporary harness.

## Fix

Chrome now uses the existing tab-scoped declarative header lease alongside its partitioned cookie. The HTTP request carries only the current delegated session, eliminating ambiguity without deleting or replacing the user's native login cookie. The partitioned cookie remains necessary for native WebSocket handshakes. Safari retains its existing header/local-cookie combination; Firefox retains its existing partitioned-cookie path.

Rules target only the selected localhost port and tab, exclude top-level navigation, stay in browser session rules, and never expose credentials to page/content scripts. Revocation removes both kinds of delegation. Background initialization clears previous managed session rules before restoring an authorized connection. Rule ids are allocated independently of Chrome tab ids, which can exceed one billion.

The Chrome manifest additionally declares `declarativeNetRequestWithHostAccess`. The packaged manifest checks enforce its presence. This extension-only change does not require an npm publication.

Final validation: `pnpm check` passed with 86 tests passing and one preexisting skip, TypeScript, privacy/architecture checks, all three extension builds, generated-manifest checks, and Safari's native `WKWebExtension` validation. `git diff --check` passed. Both tested DSH versions passed the retained real-browser authentication regression.

## Repeatable browser regression

Prepare an isolated test dependency prefix, and use an extension-capable Chromium/Chrome for Testing executable:

```sh
npm install --prefix /tmp/aow-dsh-auth-test --no-audit --no-fund @deepseek-ai/dsh@0.1.5-rc.3 playwright-core
pnpm build:extension
node scripts/check-dsh-auth-browser.mjs \
  --deps /tmp/aow-dsh-auth-test \
  --chromium /path/to/chrome-for-testing
```

Pass `--dsh /path/to/@deepseek-ai/dsh/lib/bin.js` to exercise a different installed DSH version. The script creates a fresh browser profile and DSH home, serves a synthetic HTTPS website in the test browser, requests/approves an actual connector grant, and checks:

- The native iframe does not display the reported authentication error and returns 200.
- An unknown API route passes authentication and returns 404.
- The native `/api/remote.mux` WebSocket handshake opens.
- The preexisting first-party cookie remains unchanged.
- Revocation removes the delegated header rules.

No model request is made. Runtime and browser test processes and their generated home are cleaned up. At least one of the normal connector discovery ports must be free. This test verifies the authentication boundary, not every plugin API in the newer DSH release; the repository's declared supported DSH baseline remains unchanged.

## Computer Use acceptance on the real website

Completed with native Computer Use in ordinary Google Chrome, using a separate signed-out local profile named `AgentOnWeb Auth QA`, the unpacked fixed extension, and the real `https://www.youtube.com/` page. No route interception, browser-evaluated JavaScript, or backend approval was used for this acceptance.

DSH `0.1.5-rc.3` ran at `127.0.0.1:3081` with its own `DSH_HOME`. To coexist with the user's running DSH, a temporary copy of the built surface plugin changed only its runtime id/display name to `deepseek-harness-qa` / `DeepSeek Harness QA (latest)` and its authorization directory to the temporary QA directory. Its authentication and surface implementation were unchanged. The daily Chrome profile, installed extension, DSH process, and terminal service were not replaced or restarted.

Verified through visible UI:

1. Open the DSH URL printed by the new test process; complete the initial notice and skip optional API-key configuration.
2. On real YouTube, open AgentOnWeb, choose the QA runtime, and request a connection.
3. In native DSH Settings → AgentOnWeb, observe the pending extension request and click **Allow connection**. The request changes to **Revoke connection**.
4. Return to YouTube. The nested `localhost:3081` DSH workspace renders its native sidebar, workspace chooser, settings, and composer without the reported authentication error.
5. Refresh YouTube and reopen with the extension shortcut. The workspace loads without another connection approval.
6. Reload the extension from `chrome://extensions`, refresh YouTube, and reopen. The authorized workspace again loads without another approval. Chill mode displays the DSH workspace over the real YouTube page.

This GUI pass used a clean profile and did not inject a stale cookie; the earlier retained browser regression covers the conflicting-cookie case. No API key was configured and no model turn was sent. DSH's optional API-key prompt recurs when loading this unconfigured test instance. Chrome also recorded an iframe `postMessage` target-origin warning during navigation; it did not prevent the observed workspace load or reconnection.

A separate onboarding boundary was observed: opening the daily DSH's bare approval URL in a new browser profile returns the same authentication text because that profile lacks DSH's native login. The old logged launch URLs tested did not authenticate that running instance. The extension cookie-order fix does not turn an unauthenticated top-level DSH URL into a login link.
