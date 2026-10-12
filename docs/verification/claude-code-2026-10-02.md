# Claude Code support verification — 2026-10-02

Branch: `codex/claude-code-support`, created from `main`. The pre-existing `vitest.config.ts` change was preserved. No commit, push, PR, store upload or public release was performed.

## Implementation

Claude Code uses the existing terminal-bound, authenticated agent-event ingress and the shared session/notification presentation. Its native hooks map to Ready, Working, Needs approval, Completed, Interrupted and Ended. Session identities are namespaced by agent. Approval choices remain in the native CLI.

`aow setup` installs both integrations. `aow claude-hooks install|uninstall` manages only AgentOnWeb's observational hooks in `CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`). The installer preserves models, permission rules, disabled-hook policy and unrelated hooks, backs up changes, refuses malformed configuration and is idempotent. The packaged lightweight reporter invokes Node directly with arguments, sends bounded presentation fields only, decodes split UTF-8 and reports complete JSON without waiting for stdin EOF. It emits no permission decision or stdout.

## Automated validation

The complete release gate passed with Vitest limited to four workers:

```sh
pnpm check:privacy
pnpm check:architecture
pnpm typecheck
pnpm --filter @agentonweb/dsh-surface build
pnpm --filter @agentonweb/terminal-host build
pnpm exec vitest run --maxWorkers=4
pnpm build
pnpm build:extension:firefox
pnpm build:extension:safari
node scripts/check-extension-builds.mjs
pnpm check:extension:safari-native
node scripts/release-audit.mjs
```

- 44 test files passed: **213 tests passed, 1 existing optional DSH integration test skipped**.
- Real host/PTY tests covered both Codex and Claude reporters, authenticated running/approval/completion delivery with the viewer closed, reconnect snapshots and terminal cleanup.
- Reporter regression left stdin open and split a Chinese UTF-8 character across writes; the process still reported and exited quietly before EOF.
- Native `/exit` was reproduced with a different `prompt_id` from the preceding model turn. The regression failed before the fix and passed afterward, including resume and rejection of late previous-turn completion.
- Chrome MV3, Firefox MV2 and Safari MV2 builds/manifests passed; Safari WKWebExtension validation passed.
- The packed terminal host passed an isolated production install, Claude hook preservation/idempotence/uninstall, packaged reporter invocation, browser assets and real shell input/output.

Unrestricted parallel runs intermittently exceeded an existing installer's five-second test timeout under heavy unrelated CPU load. The same assertions and complete gate passed with four workers; test timeouts were not relaxed.

## Computer Use acceptance

Used native Computer Use to operate visible official Chrome for Testing 153 and Claude Code 2.1.267, with the unpacked 0.2.0 extension and the repository-built local service. These were real CLI/model turns in temporary fixture projects, using the user's existing configured model and authentication. The simulated activity preview was not the acceptance target. The browser's existing grant was retained; unrelated active terminals were not stopped.

| Scenario | Observed result |
| --- | --- |
| Launch and hook review | Native Claude TUI launched; `/hooks` showed the ten configured observational events. |
| Task completion | A real text-only turn returned `AOW_CLAUDE_COMPLETE_OK`; the page listed Claude Code as Completed and displayed its completion notification. |
| Approval and tool result | `printf AOW_CLAUDE_APPROVAL_OK` produced Working, Needs approval, the tool description and an amber notification. A one-time native approval executed the command, cleared approval and produced completion. |
| Correct terminal activation | From a second terminal and from Watch mode, selecting the approval notification returned to the exact pending native CLI prompt. |
| Concurrent sessions | Separate project/parallel tasks showed distinct titles and a count of two. Cancelling one did not complete it; the other finished independently with its own notification. |
| Presentation modes | Chill displayed the translucent terminal, Focus displayed the opaque terminal, and Watch hid it while tasks/notifications continued. |
| Consecutive standard-config turns | With hooks installed only at user scope, a real Bash task and a following text-only task updated their titles/states and completed without hook errors. |
| Refresh/reconnect | Refresh restored the same CLI screen and terminal sessions. The dismissed completion notification did not replay. |
| Session exit and resume | After the lifecycle fix, resumed the observed session with the native `--resume` command and exited through `/exit`. SessionStart/SessionEnd received HTTP 204, the page showed no agent sessions, and the shell stayed available. |
| Terminal close | Closing the first QA terminal removed its sessions while preserving the other terminal's completed session. Closing the second left no terminals. |

The first acceptance setup loaded identical hooks from both user settings and an extra settings file and showed intermittent hook timeouts. Final standard-config checks used one hook source. Startup/reporting was also reduced to the standalone helper and direct execution. Temporary diagnostic instrumentation was removed from the built reporter. A temporary diagnostic insertion itself caused one startup syntax error; it was corrected before the clean final checks.

All QA terminals were closed. The temporary user-level Claude hook installation was removed, and the original settings file was restored byte-for-byte after checking for unrelated concurrent changes. Task-owned credential snapshots and temporary diagnostics were removed. The repository-built local service and QA extension remain available locally; enabling Claude notifications for normal use requires `aow claude-hooks install` (or `aow setup`).

## Boundaries

Claude Code has no universal user-interrupt hook. Esc or a native denial can leave the page's approval/running summary unchanged when no supported event is emitted. This was observed; the next user prompt clears the old approval. Native decisions remain authoritative. An idle notification clears otherwise running state, and session end/terminal close clears the session. Other Stop hooks can continue a turn after observational completion; subsequent tool activity restores Working.

Firefox and Safari were build/package validated in this task; live Computer Use acceptance was Chrome only. The service and test extension were local source builds. They were not uploaded to stores or published to npm.

See [event mapping and limitations](../agent-notifications.md), [setup](../one-command-setup.md), [official Claude hooks](https://code.claude.com/docs/en/hooks) and [official settings](https://code.claude.com/docs/en/settings).
