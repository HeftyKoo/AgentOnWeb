# AgentOnWeb rename verification

Date: 2026-09-08.

- Product, package scopes, extension entries, icon paths, UI labels, descriptions, protocols, configuration namespaces and current documentation use AgentOnWeb.
- Product positioning is Agent On Web. The currently implemented edition is DSH On Web, with native DeepSeek Harness ownership of sessions, tools and authorization.
- Version remains 0.1.0, DSH 0.1.2-alpha.3, connector protocol 1.
- The full release audit passed after the rename: 55 tests, TypeScript, architecture checks, all three browser builds, Safari native extension parsing, packed plugin import and reproducible release archives.
- Packaging normalizes dependency-map order in the packed manifest before comparing archive bytes. This fixes pnpm's variable workspace-dependency insertion order without weakening the reproducibility check.
- Chrome loaded the extension from the renamed checkout, displayed AgentOnWeb, completed native DSH authorization, and ran a real file-editing task. Chill, Focus, Watch, opacity and page interaction were recorded from that installation.
- DSH runtime and settings directories use the new namespace; existing DSH session working directories were migrated while preserving historical conversation records. The runtime restarted successfully and a fresh native task wrote files under the new root.
- Both Chinese and English product films were remade from new captures.
