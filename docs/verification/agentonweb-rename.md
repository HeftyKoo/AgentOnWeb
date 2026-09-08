# AgentOnWeb rename verification

Date: 2026-09-08. Target directory: `/Users/hefty/Project/AgentOnWeb`.

- Product, package scopes, extension entries, icon paths, UI labels, descriptions, protocols, configuration namespaces and current documentation use AgentOnWeb.
- Product positioning is Agent On Web. The currently implemented edition is DSH On Web, with native DeepSeek Harness ownership of sessions, tools and authorization.
- Version remains 0.1.0, DSH 0.1.2-alpha.3, connector protocol 1.
- The full release audit passed in the renamed directory: 55 tests, TypeScript, architecture checks, all three browser builds, Safari native extension parsing, packed plugin import and reproducible release archives.
- Packaging normalizes dependency-map order in the packed manifest before comparing archive bytes. This fixes pnpm's variable workspace-dependency insertion order without weakening the reproducibility check.
- Chrome loaded the extension from the new directory, displayed AgentOnWeb, completed native DSH authorization, and ran a real file-editing task. Chill, Focus, Watch, opacity and page interaction were recorded from that installation.
- DSH runtime and settings directories use the new namespace. Eight existing DSH session working directories were migrated while preserving historical conversation records. The runtime restarted successfully and a fresh native task wrote `output/promo-video/demo-project/shortcuts.ts` under the new root.
- Both Chinese and English product films were remade from new captures. See `output/promo-video/README.md` and `QA.md` for media verification.

## Codex session migration verified

The project retained its original project ID, and all 14 Codex sessions retained their original session IDs. The migrated session metadata and task index point to `/Users/hefty/Project/AgentOnWeb`.

After Codex was fully closed, the migration helper completed the final session and saved-project migration at 12:58:06. On reopening, the app's project list displayed AgentOnWeb at the new path. The current task executed from that directory without an explicit working-directory override, and the native task-reading tool returned the new path. A stale current-task index entry was aligned with its migrated session header and active working directory, then rechecked after further tool calls.

All 13 inactive sessions' non-metadata records match their migration hashes. The current session's complete pre-migration conversation remains an identical prefix, followed by its new turns. Historical user messages and earlier tool outputs were preserved. SQLite integrity checks passed.

The final state backup is `/Users/hefty/.codex/backups/agentonweb-20260908-120509/final-session-backup-20260908-125805`. The migration helper finished and no longer waits for the app to close. Status is recorded in `output/project-rename/codex-migration-status.json`.

No Git commit or push has been performed for this rename.
