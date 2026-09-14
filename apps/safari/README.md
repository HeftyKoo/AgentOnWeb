# AgentOnWeb Safari release

The containing app is a macOS-only Safari Web Extension, built with Xcode. It gives users installation instructions, opens Safari's native extension settings, and includes a populated offline interactive demo. It does not bundle or start a DSH process.

- App Store Connect app ID: recorded in the gitignored `docs/verification/local/` notes and intentionally not published
- App bundle ID: `dev.agentonweb.extension`
- Extension bundle ID: `dev.agentonweb.extension.safari`
- Version: `0.1.0`, build `5`
- Minimum: macOS 15.4 and Safari 18.4
- Architectures: Apple Silicon and Intel

## Prepare and build

Run the repository release audit before a store submission:

```sh
pnpm release:audit
pnpm prepare:safari
```

The prepare command builds Safari with WXT, synchronizes the ignored extension resources into the Xcode project, validates target version alignment, and produces a Safari-specific ZIP under `release/safari/`. The Chrome ZIP must not be uploaded as the Safari build.

Complete Xcode first-launch setup and sign in under Apple Accounts. Configure signing once on each machine:

```sh
cp apps/safari/config/Signing.local.xcconfig.example apps/safari/config/Signing.local.xcconfig
```

Replace the placeholder in the local file with your Apple Developer team ID. Both targets inherit it through the shared `Signing.xcconfig`, in Xcode and on the command line. The local file is gitignored. Do not select a different team in the target editor: Xcode may persist that value into the shared project. Edit the local configuration instead. Contributors can leave this file absent for unsigned builds; CI can supply the same `AGENTONWEB_DEVELOPMENT_TEAM` build setting from its private environment.

The shared `ExportOptions.plist` contains only generic export options. It omits `teamID`, so Xcode uses the team that signed the archive. Keep private keys and provisioning profiles in Xcode/Keychain or private CI storage. Signed archives, packages, and account-bound review notes stay in ignored local directories.

To archive and export:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project apps/safari/AgentOnWeb/AgentOnWeb.xcodeproj \
  -scheme AgentOnWeb -configuration Release \
  -archivePath release/safari/AgentOnWeb-0.1.0-4.xcarchive \
  -derivedDataPath output/safari-derived -allowProvisioningUpdates archive

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -exportArchive -archivePath release/safari/AgentOnWeb-0.1.0-4.xcarchive \
  -exportPath release/safari/app-store \
  -exportOptionsPlist apps/safari/config/ExportOptions.plist \
  -allowProvisioningUpdates
```

`ExportOptions.plist` exports an App Store Connect package without uploading it. Upload the resulting `.pkg` through Xcode Organizer/Transporter, or export the archive using a separate options file with `destination=upload`. Increment `CURRENT_PROJECT_VERSION` for a replacement build after a successful upload; all targets must use the same build and marketing version.

## Store materials

- Public support: https://heftykoo.github.io/AgentOnWeb/support.html
- Privacy policy: https://heftykoo.github.io/AgentOnWeb/privacy.html
- Page source: `docs/store-site/`, deployed on the `gh-pages` branch.
- Containing-app icon source and generation prompt: `assets/`.

The browser extension does not collect developer-accessible remote telemetry. The privacy policy separately explains user-configured DSH/model-provider processing. Review notes must clearly disclose the separately installed DSH runtime, supported version, provider credentials, and local authorization steps. Do not supply an API key or an authenticated runtime URL in public metadata.

A successful archive or upload is not a review submission. Verify the processed build in App Store Connect, complete the metadata and required declarations, attach accurate screenshots, and confirm the final review status separately.

## Git privacy checks

Run `pnpm check:privacy` before staging or committing. It also runs with `pnpm check`, `pnpm release:audit`, and `pnpm prepare:safari`. It checks tracked and nonignored files plus staged changes, rejects literal signing teams, account-bound App Store links/identifiers, and private signing artifacts, and reports paths without printing sensitive values. This is a targeted guard, not a general secret scanner; inspect new account fields before committing. `.gitignore` does not protect a file that was already tracked or force-added.

Bundle identifiers and generic product configuration remain public. Team IDs are not authentication secrets, but they are account identifiers and belong in local configuration under this repository's privacy policy. Signed Apple distribution artifacts can contain team and certificate metadata even when the Git source is clean.
