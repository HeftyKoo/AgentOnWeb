# Safari extension identifier change — 2026-09-09

- Requested extension identifier: `dev.agentonweb.extension.safari`.
- Main app identifier remains `dev.agentonweb.extension`; the App Store Connect app ID remains the one recorded in the gitignored local release notes.
- Updated both extension build configurations and the containing app's `SFSafariExtensionManager` / `SFSafariApplication` identifier reference.
- Both targets use marketing version `0.1.0`, build `4`, minimum macOS `15.4`.
- `pnpm prepare:safari` and Xcode automatic-signing archive/export passed.
- Archive Info.plists independently confirmed both identifiers and build numbers.
- Strict deep application signature verification passed; exported PKG signature has the Apple-issued Mac Installer certificate chain.
- Archive: `release/safari/AgentOnWeb-0.1.0-4.xcarchive`.
- Export: `release/safari/app-store-build4/AgentOnWeb.pkg`; SHA-256 recorded alongside it.
- Clean local installation registered only `dev.agentonweb.extension.safari` in Safari's extension registry.
- The containing app's settings button opened the correct Safari extension settings. The checkbox accessibility ID independently confirmed the new identifier.
- Safari blocked automated extension activation with its click-interference security notice. The user enabled AgentOnWeb manually; the checked UI element confirmed `dev.agentonweb.extension.safari`.
- Real Safari validation passed: website and loopback permissions, native DSH connection approval, local-session access, existing code conversation restoration, opaque Focus, translucent Chill, and Watch hiding the entire workspace while retaining the dock.
- Build 4 upload succeeded at 14:53 local time. App Store Connect listed it as Ready to Submit, and it was selected and saved on version 0.1.0.
- Replaced the prior build 3 review only after build 4 passed upload processing and local verification. The three YouTube screenshots, their order, and existing store metadata were preserved.
- Submit for Review returned **1 Item Submitted**. The separate submission detail page confirmed **Waiting for Review**, version **0.1.0 (4)**, submitted **September 9, 2026 at 2:59 PM Asia/Shanghai**.

No main-branch changes have been committed or pushed.
