# Host startup readiness and CI runtime

The previous CI run 40326913684 failed while parsing the first terminal registry
response. Extension release run 40802248815 initially failed at the same stage
of the authorized-browser revocation test. Both tests first open the one-time
launch URL and reuse the cookies it returns.

The host printed that URL before its initial `saveEndpoint()` completed.
Opening the URL immediately started another save to the same `endpoint.tmp`.
One rename could remove the other request's temporary file, causing `/launch`
to return HTTP 500 without cookies. The next protected API request returned
HTTP 403 with an empty body, producing `Unexpected end of JSON input`.

The regression test delays the first two endpoint writes in an isolated child
host. Before the fix, the launch request returned HTTP 500 instead of 200.
After moving the initial endpoint save before the readiness log, the launch
returns HTTP 200 with its admin cookie, and both protected JSON APIs respond
successfully. All 27 host integration tests and the complete release audit
passed locally: 428 tests passed and two optional tests were skipped.

CI and Release now use Node.js 24.22.2 on Ubuntu 24.04. Their actions are
checkout 7.0.1, setup-node 7.1.0, pnpm/action-setup 6.1.0 and upload-artifact
7.0.2; each upstream action manifest declares `runs.using: node24`. Pinning the
runner avoids the `ubuntu-latest` Ubuntu 26 migration notice. The terminal
runtime minimum remains Node.js 22.19.

The previously created `ext-v0.4.2` tag remains unchanged. Its second Release
attempt succeeded, and Chrome/Firefox 0.4.2 were submitted from its audited
packages. This follow-up changes future builds and CI; it does not republish
the existing terminal-host 0.4.3 npm package.
