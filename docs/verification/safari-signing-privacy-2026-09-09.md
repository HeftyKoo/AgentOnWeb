# Safari signing configuration and Git privacy

- Shared Xcode Debug/Release configurations inherit `config/Signing.xcconfig`. Both targets resolve the team from the ignored `Signing.local.xcconfig`; no account value is present in the shared project.
- The containing app and extension build settings were checked individually for Debug and Release. All four resolved the local signing account correctly without printing it.
- A temporary project without the local configuration resolved build settings with no signing team, confirming the optional include works for contributors.
- Shared export options omit the team field. Xcode's own help documents that export defaults to the archive's team. A real export of the existing build 4 archive succeeded with these generic options.
- Account-bound review identifiers were moved to ignored local notes. Public verification reports retain build numbers, outcomes, and timestamps.
- `pnpm check:privacy` passed over Git candidates and staged changes. It is included in normal checks, CI release audit, and Safari preparation.
- Four regression tests passed, including quoted/conditional Xcode values, account URLs, private artifact paths, a sensitive staged copy hidden by a cleaned working tree, and a force-added local signing file.
- `pnpm prepare:safari` and `git diff --check` passed.
- Known account identifiers from local release notes had no matches in 23 locally reachable main-repository commits or the two locally available published support-page commits. This is a bounded local-history check, not a scan of every remote ref or published binary.
- This was a configuration-only change with no build or upload activity. No source changes were committed or pushed.

This check targets Apple release metadata and private signing files. It does not replace review of arbitrary new secrets. Signed distribution artifacts contain signing identity metadata and remain outside Git.
