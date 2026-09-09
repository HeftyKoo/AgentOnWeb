# Safari App Store submission — 2026-09-09

> Superseded at 14:59 by build **0.1.0 (4)** after the user requested the extension identifier `dev.agentonweb.extension.safari`. The replacement is confirmed **Waiting for Review**. See [build 4 verification](safari-bundle-id-build4-2026-09-09.md). The build 3 details below are retained as historical evidence.

## Build and validation

- App Store Connect app ID: recorded in the gitignored local release notes; bundle: dev.agentonweb.extension.
- Final archive: `release/safari/AgentOnWeb-0.1.0-3.xcarchive`.
- Store export: `release/safari/app-store-build3/AgentOnWeb.pkg`.
- Version 0.1.0 (3), universal Intel/Apple Silicon, minimum macOS 15.4.
- `pnpm release:audit`: 67 tests passed, TypeScript and architecture checks passed, Chrome/Firefox/Safari manifests passed, Safari WKWebExtension validation passed.
- `pnpm prepare:safari`, Xcode archive/export, and strict deep signature verification passed.
- Xcode upload completed successfully at 13:51 local time. App Store Connect subsequently listed build 0.1.0 (3), and it was selected on the version form.
- Safari final signed installation on example.org verified native DSH authorization, the local-session gate, restored Hi conversation, opaque Focus, translucent Chill, and Watch hiding the complete frame while retaining the dock.
- The Focus regression reproduced with a website-wide `div { opacity: .8 }` rule. Pinning the shadow host opacity to 1 fixed the real Safari display. The regression test fails with 0.8 without the fix and passes with the fix.
- Modifier-only key presses are unsupported by the current UI tool, so double-Option was not manually revalidated in this pass. Automated interaction and wrapper forwarding checks passed.

## Store material boundary

- New containing-app icon generated with imagegen; source and prompt are in `apps/safari/assets/`.
- Support and privacy pages published at https://heftykoo.github.io/AgentOnWeb/ and /privacy.html. Setup now documents localhost permissions and Safari local-session access. Public HTML verified after gh-pages commit 480a421.
- App name, subtitle, Developer Tools category, content rights, and age rating 4+ saved. Privacy declaration published as Data Not Collected.
- Version 0.1.0, English description, promotional text, keywords, URLs, copyright, and review instructions entered. The user supplied the review contact phone number in App Store Connect. The completed contact details, updated review instructions, and selected build were then saved successfully; the phone validation errors cleared.
- Free pricing confirmed; availability shows all 175 countries or regions as Available on App Release.
- Review contact fields saved successfully after the user completed the phone number. Do not copy the private number into this report.
- Three real Safari window screenshots uploaded, ordered Chill, Focus, Watch. The final set uses the same real YouTube CHARGE movie and native DSH code session as the promotional video, replacing the initial example.org set at the user's request. With explicit user permission, `screencapture` captured the actual 1279x800 window; `sips` added one background column and exported 1280x800 RGB JPEGs. Final originals and exports are retained in `release/safari/screenshots/youtube/` and its `store/` subdirectory. The product UI was not generated or fabricated.
- The public store description includes CHARGE author attribution, the Blender project URL, and the CC BY 4.0 license URL. Existing footage rights evidence is in `output/promo-video/music/LICENSE.md`.
- App Store Connect confirmed 3 of 10 Screenshots, and Add for Review passed validation with build 0.1.0 (3).

## Confirmed submission

- Submit for Review returned **1 Item Submitted**.
- The submission detail page independently confirmed **Waiting for Review**, macOS App 0.1.0, build **0.1.0 (3)**.
- Date submitted: **September 9, 2026 at 2:31 PM**, local Asia/Shanghai time.
- Submission and review identifiers (submission IDs, review detail URL) are recorded in the gitignored local release notes.
- An earlier 2:22 PM submission was withdrawn solely to replace the screenshot set; its ID is in the local notes. The final submission above is confirmed Waiting for Review with the same build 3.
- Submission is complete; Apple approval and public App Store release are pending.

Main-branch changes were not committed or pushed in this task. Only the support/privacy gh-pages branch was published.
