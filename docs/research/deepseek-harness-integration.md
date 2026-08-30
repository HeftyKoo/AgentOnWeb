# DeepSeek Harness programmatic integration for Overcode

Research snapshot: 2026-08-29 (Asia/Shanghai)

## Recommendation

Use **ACP v1 over stdio**, launched by the Overcode local bridge with `dsh --profile acp`, as the V1 DeepSeek Harness integration boundary.

This is the narrowest currently available boundary that covers Overcode's essential runtime-independent surface: persistent multi-session creation/list/resume/close, one primary workspace per session, prompts, cancellation, semantic assistant/reasoning updates, generic tool lifecycle, model/reasoning selection, and one-shot permission requests. It is also an external standard rather than a DeepSeek-specific event graph. Keep every ACP type and translation inside `runtime-deepseek-harness`; the browser extension and Overcode core should only see `AgentRuntime` types.

This is a relative stability recommendation, not a claim that DeepSeek Harness itself is stable. The official repository says the whole product is a developer preview with expected compatibility-breaking changes. The source baseline used here is the official prerelease [`dsh-v0.1.2-alpha.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.1), commit [`cd5ef8148158c3a752a658978873241fdf8e2bbc`](https://github.com/deepseek-ai/deepseek-harness/commit/cd5ef8148158c3a752a658978873241fdf8e2bbc), committed 2026-08-28 00:57:43 +08:00. The repository's preview warning is explicit. [Source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/README.md#L11-L15)

Do **not** choose the SDK Profile as the primary V1 boundary: its JSON-RPC wire has only `initialize`, `session/prompt`, and `shutdown`, plus raw DeepSeek session/status/subagent notifications. It explicitly has no prompt cancel, per-session close, approval request path, protocol negotiation, or persisted-session list/resume. [SDK method set](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/sdk/protocol/README.md#L34-L52) · [SDK limitations](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/sdk/protocol/README.md#L110-L116)

Do **not** make the Web Remote Host/Client API the default boundary. It is the richer fallback if Overcode later needs exact DSH Web behavior, but it is an application BFF assembled from generated Cordis contributions, a Connection carrier, API Gateway, event allowlists, strict generated codecs, and Host/Client services. The official docs say its capability set is fixed by build-time imports, owns no physical transport or service discovery, and is designed for Web or a future TUI that supplies the same Client Cordis contract. That is a much larger and more DSH-specific integration surface than ACP. [API Remotes](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/remotes/README.md#L10-L43)

## Important distribution caveat

The ACP contract described below is the latest official source/tag behavior, not the behavior of the older published `0.1.1-rc.2` line. At research time, the official npm registry still reported `@deepseek-ai/dsh` `next`/latest published prerelease as `0.1.1-rc.2`, while the source repository had already released `dsh-v0.1.2-alpha.1`. The older ACP implementation lacks list/resume/close, tool/reasoning updates, model configuration, and persistent-session recovery. Pin an exact runtime build and verify its ACP handshake/capability matrix; do not depend on `master`, `latest`, or package-name defaults. [Official npm registry metadata](https://registry.npmjs.org/@deepseek-ai%2fdsh) · [0.1.1 ACP contract](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/acp/acp/README.md) · [0.1.2-alpha.1 ACP contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/README.md)

The `0.1.2-alpha.1` ACP package pins `@agentclientprotocol/sdk` `1.4.0`. That SDK release identifies ACP protocol version `1`; its published commit is [`e6463f444093ed7c5f1cc937c3f32afb5853e906`](https://github.com/agentclientprotocol/typescript-sdk/commit/e6463f444093ed7c5f1cc937c3f32afb5853e906), committed 2026-08-20 22:57:42 UTC. [DSH ACP package manifest](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/package.json#L1-L25) · [ACP SDK manifest](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/package.json#L1-L35) · [ACP v1 constant](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/index.ts#L302-L323)

## Interface comparison

| Boundary | What it exposes | Strengths for Overcode | Material gaps / coupling | Verdict |
|---|---|---|---|---|
| **ACP v1 profile** | Standard JSON-RPC stdio: initialize, new/list/resume/close, prompt/cancel, config options, `session/update`, permission request | Persistent multi-session, per-session cwd, cancellation, generic tool/reasoning/message events, one-shot approvals; standard capability negotiation; DSH presentation types stay private | No transcript replay/load, fork/delete, multiple roots, plans, terminals, commands, titles, elicitation, raw token deltas, or semantic subagent tree; no ACP auth because stdio is trusted | **Recommended V1** |
| **SDK Profile + TypeScript/Python SDK** | DSH newline-delimited JSON-RPC subprocess; raw `SessionEvent`, agent status, local subagent start/finish | Small API, full raw event visibility, explicit process ownership, useful for automation/tests | No cancel, approvals, session close/list/resume, protocol negotiation, or per-prompt result; workspace/model route are process-level initialization fields; wire leaks DSH session vocabulary | Not sufficient for interactive V1 |
| **Remote Host/Client APIs (Web/TUI BFF)** | Generated Typert Remote methods, streams, forwarded events over Connection HTTP/WebSocket/in-process carrier | Richest UI surface: session list/create/fork/prompt/cancel/queue/history/follow/control; approval and user-question waterfalls; reconnection models | Requires the DSH Client Cordis environment, generated artifacts, connection/auth/trust policy, application event allowlist, and multiple packages; not an intentionally small external protocol | Rich fallback, not default |
| **Same-process Host services (`ctx.agents`, `ctx.sessions`, etc.)** | Direct Cordis services/events/plugins inside one DSH process | Maximum capability and extensibility; create/resume, followup/steer/inject/cancel, durable event log | Embeds DSH and its composition lifecycle; highest API churn and type coupling; defeats process/runtime isolation | Only for a DSH plugin, not Overcode core |
| **Headless profile** | One task in, final answer/exit code out | Tiny, robust for CI or one-shot automation | No server, no follow-up, no persistent interactive session | Not a workspace runtime |
| **Webhook runtime** | Authenticated external event to fire-and-forget Session creation | Useful later for triggers | No queue, completion result, status, replay, or interactive control | Orthogonal, not an adapter boundary |

DeepSeek defines the shipped application profiles as `web`, `headless`, `sdk`, `sdk-minimal`, and `acp`; `web`, `headless`, `sdk`, and `acp` share `dsh-base`, while each app bundle adds its transport/presentation boundary. [Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/docs/architecture.md#L15-L47)

### Why ACP wins despite being called “automation-only”

The official ACP package deliberately exports semantic, standard data rather than DSH presentation internals. It supports standard messages, reasoning, generic tools, configuration, context usage, and permission decisions; it explicitly omits private cards, plans, titles, todos, terminals, and elicitation. That omission is desirable for Overcode's runtime-independent core as long as V1 accepts the gaps below. [ACP summary and selection guidance](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/README.md#L10-L32)

The current DSH ACP implementation advertises `session/list`, `session/resume`, and `session/close`; supports `session/new`, `session/set_config_option`, prompt/cancel, serialized semantic updates, and `session/request_permission`; and runs several independent sessions on one stdio connection. [Protocol contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/README.md#L53-L76) ACP v1 itself requires baseline support for new/prompt/cancel/update and advertises optional list/resume/close through session capabilities. [ACP SDK schema](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/types.gen.ts#L1807-L1871)

ACP's “chunks” are not raw provider token deltas in this DSH adapter. DSH converts committed `assistant/message` blocks to `agent_message_chunk` / `agent_thought_chunk`, and durable tool call/result facts to generic tool updates. Raw provider deltas, retries, and DSH-only presentation stay off the wire. [DSH ACP semantics](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/README.md#L88-L94) · [message/tool mapping source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/src/updates.ts#L1-L94)

### Why SDK Profile loses

The TypeScript SDK is a good process owner: it starts a complete Harness subprocess, can open named session handles, sends prompts, exposes subscriptions, and collects until whole-agent idle. But this is an automation run API rather than an interactive control protocol. [TypeScript SDK contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/sdk/client/README.md#L10-L54)

Its wire exposes the complete DSH `SessionEvent` vocabulary and DSH subagent types, so adopting it directly would make Overcode's “runtime-independent” contract largely a type alias over DSH internals. More importantly, the official limitations explicitly require process shutdown for cancellation and state that server-to-client requests for approvals are not implemented. [SDK payload coupling](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/sdk/protocol/README.md#L50-L52) · [SDK client limitations](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/sdk/client/README.md#L118-L125)

### Why Remote Host/Client APIs are the fallback

The Remote session controller is already the right *functional* shape for a rich human UI: list/search/create, model selection, rename/fork, prompt, queue mutation, cancel, paged history, a gap-free follow stream, and a live control stream. [Session Remote methods](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/session-controller/src/index.ts#L202-L390) The application event allowlist forwards both `approval/request` and `user-questions/request` as Agent-scoped waterfalls. [Forwarded events](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/remotes/src/remote-events.ts#L12-L31)

However, the Gateway is a two-sided Cordis RPC system with generated descriptors/codecs, logical streams, reconnection, an internal event stream, connection generations, and browser/in-process carriers. Only strict generated contributions can mount on the Client side. This is an excellent DSH Web architecture, but not a narrow stable third-party process API. [Gateway contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/gateway/README.md#L10-L50) · [Gateway limitations](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/gateway/README.md#L61-L71)

### Same-process Host APIs and other surfaces

The direct Host API is the public plugin surface inside a DSH composition. `ctx.agents.create()` and `resume()` return an owned handle; `Agent` exposes its session/inbox/status plus `cancel`, `whenIdle`, `followup`, `steer`, and `inject`. It is powerful but makes Overcode a DSH host/plugin, not a runtime-independent client. [Core Agent contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/docs/subsystems/core.md#L22-L55) · [Agent operations](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/docs/subsystems/core.md#L59-L155)

The headless profile is intentionally one task per invocation with no server or interactive follow-up. [Headless contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/bundle/headless/README.md#L10-L46) The webhook runtime is fire-and-forget and intentionally owns no queue, status, replay, or completion result. [Webhook contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/docs/subsystems/webhook.md#L5-L29)

## Exact ACP wire used by the adapter

Launch the pinned DSH executable as a long-lived child:

```sh
dsh --profile acp
```

The shipped ACP app reserves stdout for protocol traffic and uses a newline-delimited JSON stream over process stdin/stdout. The ACP SDK describes this as the stable ACP v1 stream over individual JSON-RPC messages. Diagnostics must not be written to stdout. [DSH stdio wiring](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/src/index.ts#L371-L390) · [ACP SDK framing](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/acp.ts#L25-L53) · [ACP app profile](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/bundle/acp-app/README.md#L10-L38)

Exact methods implemented by DSH `0.1.2-alpha.1`:

| Direction | JSON-RPC method | Role |
|---|---|---|
| Overcode client → DSH agent | `initialize` | Negotiate ACP v1; receive `agentInfo`, prompt/MCP/session capabilities, and empty auth methods |
| Overcode client → DSH agent | `authenticate` | Immediate empty success; DSH ACP advertises no auth method |
| Overcode client → DSH agent | `session/new` | Create a persistent session with absolute `cwd` and optional supported MCP servers |
| Overcode client → DSH agent | `session/list` | Page inactive resumable root sessions, optionally filtered by absolute `cwd` |
| Overcode client → DSH agent | `session/resume` | Restore one inactive persisted session without replaying prior updates |
| Overcode client → DSH agent | `session/close` | Cancel/drain/flush/dispose one active session without deleting persistence |
| Overcode client → DSH agent | `session/set_config_option` | Select advertised `model` or `reasoning_effort` state |
| Overcode client → DSH agent | `session/prompt` | Submit one in-flight prompt for the session and settle after agent idle/update drain |
| Overcode client → DSH agent | `session/cancel` notification | Cancel admission or current work for one session; unknown ids are no-ops |
| Either peer → other request | `$/cancel_request` notification | Cancel the identified in-flight JSON-RPC request where supported by the ACP SDK |
| DSH agent → Overcode client | `session/update` notification | Send message/thought/tool/config/usage semantic updates |
| DSH agent → Overcode client | `session/request_permission` request | Ask the client to choose one offered permission outcome |

The DSH method registration is explicit in the official source. [Method registrations](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/src/index.ts#L376-L390) The ACP SDK owns the literal method-name constants. [ACP method constants](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/index.ts#L271-L323)

DSH permission requests have this exact semantic payload:

```ts
{
  sessionId,
  toolCall: { toolCallId },
  options: [
    { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
  ],
}
```

The client response is either `{ outcome: { outcome: 'cancelled' } }` or `{ outcome: { outcome: 'selected', optionId } }`. DSH maps `allow-once` to its one-shot allow result and every other selected offered option to rejection. It never infers a durable grant. [DSH permission bridge](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/src/index.ts#L151-L171) · [ACP permission response types](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/types.gen.ts#L6021-L6059)

Current DSH `session/update` output is deliberately narrower than the full ACP `SessionUpdate` union:

- committed assistant non-reasoning blocks → `agent_message_chunk` with the DSH message id;
- committed reasoning blocks → `agent_thought_chunk` with the same message id;
- durable tool call → `tool_call` with `kind: 'other'`, `status: 'in_progress'`, title, and parsed `rawInput`;
- durable tool result → `tool_call_update` with `completed` or `failed` plus displayable content;
- context measurement, when both usage and capacity exist → `usage_update`;
- model topology/config changes → complete `config_option_update` state.

[DSH update mapping source](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/src/updates.ts#L9-L101) The adapter must accept unknown standard `sessionUpdate` variants for forward compatibility, preserve them as runtime metadata, and not crash the connection.

## Recommended Overcode topology

```text
Website tab
  └─ Overcode Shadow-DOM UI
       └─ extension messaging
          └─ MV3 background/service worker
               └─ authenticated local bridge
                    └─ DeepSeekHarnessAdapter
                         └─ ACP v1 client
                              └─ stdio child: dsh --profile acp
```

The local bridge, not a Content Script, should own the DSH process, ACP connection, session registry, pending permission resolvers, normalized event journal, and restart/reconnect policy. One ACP process can host several independent sessions and different per-session workspaces. Keep ACP on stdio; do not expose its unauthenticated protocol directly on a TCP port. The extension should authenticate only to Overcode's own local bridge.

Pin these facts in runtime diagnostics:

- DSH executable identity and exact pinned DSH version/commit.
- Selected profile (`acp`) and explicit Harness home/profile directory.
- ACP negotiated protocol version and `agentInfo`.
- Exact advertised `agentCapabilities` and prompt/MCP/session capability values.
- Adapter implementation version and normalized capability snapshot.

Reject an incompatible runtime at `connect()` rather than silently degrading core operations. Optional surfaces should degrade only through capabilities.

## Proposed runtime-independent `AgentRuntime`

The interface should be capability-based and should not mirror ACP method names one-for-one:

```ts
interface AgentRuntime {
  connect(options: RuntimeConnectOptions): Promise<RuntimeConnection>
  disconnect(): Promise<void>

  getCapabilities(): RuntimeCapabilities

  listSessions(filter?: SessionFilter): Promise<RuntimeSessionSummary[]>
  createSession(input: CreateSessionInput): Promise<RuntimeSession>
  resumeSession(input: ResumeSessionInput): Promise<RuntimeSession>
  closeSession(sessionId: RuntimeSessionId): Promise<void>

  sendPrompt(sessionId: RuntimeSessionId, input: PromptInput): Promise<PromptOutcome>
  cancel(sessionId: RuntimeSessionId): Promise<void>
  setSessionOption?(sessionId: RuntimeSessionId, option: SessionOptionSelection): Promise<SessionOptionState>

  subscribe(listener: (event: RuntimeEvent) => void): () => void
  respondToApproval(approvalId: RuntimeApprovalId, decision: ApprovalDecision): Promise<void>
}
```

`sendPrompt()` may remain pending until the runtime reaches its turn settlement. Streaming belongs to `subscribe()`, not the returned `PromptOutcome`. The ACP adapter should mint an Overcode approval id for each incoming `session/request_permission`, retain the pending ACP response promise in the local bridge, and settle it only through `respondToApproval()`.

Do not put `planMode`, `backgroundJobs`, or `subagents` methods into the mandatory interface. They are optional capabilities whose first DSH ACP implementation is `false` or opaque.

## Capability mapping for the DSH ACP adapter

| Overcode capability | DSH ACP source | V1 value |
|---|---|---|
| `sessions.create` | `session/new` | `true` |
| `sessions.list` | `sessionCapabilities.list`, `session/list` | negotiated; `true` on `dsh-v0.1.2-alpha.1` ACP profile |
| `sessions.resume` | `sessionCapabilities.resume`, `session/resume` | negotiated; `true` |
| `sessions.close` | `sessionCapabilities.close`, `session/close` | negotiated; `true` |
| `sessions.historyReplay` | `session/load` | `false` in DSH ACP |
| `sessions.fork` / `delete` | omitted/unsupported | `false` |
| `workspace.primary` | absolute `cwd` on new/resume | `true` |
| `workspace.additionalRoots` | unsupported by DSH ACP | `false` |
| `prompts.text` / `resourceLink` | ACP baseline prompt blocks | `true` |
| `prompts.images` | `promptCapabilities.image` | negotiated; route/store dependent |
| `cancellation` | `session/cancel`, `$/cancel_request` | `true` |
| `toolCalls` | `tool_call`, `tool_call_update` | `true`, generic; DSH currently reports kind `other` |
| `approvals` | `session/request_permission` | `true`, one-shot allow/reject/cancel |
| `reasoning` | `agent_thought_chunk` | `true`, committed semantic block, not raw provider delta |
| `modelSelection` | `session/set_config_option` with `model` | available from returned config options |
| `reasoningEffort` | `session/set_config_option` with `reasoning_effort` | model dependent |
| `usage` | `usage_update` | conditional on DSH usage/context facts |
| `mcpServers.stdio` / `http` | new/resume MCP declarations; advertised HTTP capability | supported by current DSH ACP contract |
| `elicitation` / human questions | explicitly unsupported | `false` |
| `plans`, `commands`, `terminals`, DSH cards/todos | explicitly unsupported | `false` |
| `subagents` | no standard child lineage/update surface in this DSH ACP adapter | `false` as a first-class capability; may be visible only as ordinary tools/output |
| `backgroundJobs` | no ACP mapping | `false` |

The DSH ACP server advertises only mounted support and returns current model/reasoning configuration; Overcode must derive capabilities from the handshake and returned option state rather than hard-code the table. [ACP capability policy](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/README.md#L88-L94)

## Event normalization

Preserve the original ACP payload under `event.runtimeMeta.deepseekHarness.acp` for diagnostics, but never require UI code to read it.

| ACP / adapter observation | Overcode event | Normalization notes |
|---|---|---|
| `session/new` or `session/resume` success | `session.opened` | Include normalized session id, cwd, available session options |
| local dispatch of `session/prompt` | `agent.started`, then `agent.running` | These are adapter-owned lifecycle facts; ACP v1 does not send a separate running-status update in this DSH implementation |
| `agent_message_chunk` | `message.delta` | Name reflects Overcode's append operation; metadata must state `granularity: "committed-block"`, not token streaming |
| change of message id, a non-message update, or prompt settlement | `message.completed` | Buffer by ACP `messageId`; flush outstanding messages in wire order before terminal agent event |
| `agent_thought_chunk` | `reasoning.delta` | Also `granularity: "committed-block"`; do not present as live hidden chain-of-thought |
| `tool_call` with `in_progress` | `tool.started` | Preserve tool call id, title, raw input; do not infer permissions or tool kind from the title |
| `tool_call_update` with `completed` | `tool.completed` | Preserve standardized content and opaque metadata |
| `tool_call_update` with `failed` | `tool.failed` | Failure is for this tool call, not automatically the entire prompt |
| incoming `session/request_permission` | `approval.requested`, `agent.waiting` | Mint Overcode approval id; include offered choices; pause remains owned by the pending ACP response |
| Overcode decision accepted by pending responder | `approval.resolved`, `agent.running` | Map to selected option id or cancelled; never auto-allow on disconnect |
| `config_option_update` | `runtime.session-options.changed` | Replace the complete option state rather than patching stale choices |
| `usage_update` | `context.updated` | Treat values as runtime-reported and optional |
| `session/prompt` returns `end_turn` | `agent.completed` | `outcome: "success"` |
| returns `max_tokens` / `max_turn_requests` | `agent.completed` | `outcome: "limit"`; surface warning, not infrastructure failure |
| returns `refusal` | `agent.completed` | `outcome: "refusal"` |
| returns `cancelled` | `agent.completed` | `outcome: "cancelled"` |
| JSON-RPC error, transport death, adapter validation failure | `agent.failed` | Preserve safe normalized error code and runtime diagnostics |
| explicit `session/close` success | `session.closed` | Does not delete persistence; a later list/resume may recover it |

ACP v1's legal prompt stop reasons are `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, and `cancelled`. [ACP SDK schema](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/types.gen.ts#L3190-L3223) DSH's adapter translates its internal turn-end vocabulary to those values and uses explicit cancellation out of band. [DSH stop mapping](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/src/codec.ts#L1-L35)

ACP permission requests carry session id, tool-call information, and available permission options; responses select an option or cancel. [ACP permission request](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/types.gen.ts#L127-L157) · [ACP permission response](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/types.gen.ts#L6021-L6059)

## V1 gaps that must be deliberate

1. **Overcode must persist its own normalized transcript/projection.** DSH ACP `session/resume` restores the agent log but deliberately does not replay old updates, and `session/load` is unsupported. Persist normalized messages, tools, terminal prompt outcomes, session options, and titles in the local bridge keyed by runtime identity + DSH session id. An ACP session discovered without an Overcode projection can be resumed for future work, but its old transcript cannot be reconstructed through this boundary. [ACP list/resume semantics](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/README.md#L60-L76)

2. **No user-question/elicitation UI in the ACP adapter.** Treat `elicitation: false`. If a DSH tool needs human data beyond one-shot permission, V1 must either avoid composing it or fail clearly. Do not silently answer on the user's behalf.

3. **No DSH plans, todos, cards, or terminal presentation.** Chill Mode should render Overcode's own conversation/tool/approval/status UI. Generic tool activity is sufficient for V1 only if product acceptance does not require DSH-specific rich surfaces.

4. **No raw token streaming.** DSH ACP emits committed message/reasoning blocks. The UI can animate those blocks, but diagnostics and tests must not call the stream token-level.

5. **No first-class subagent tree or background job model.** Preserve opaque tool/output metadata, but report the capabilities as absent until a standard or adapter-specific optional extension is intentionally designed.

6. **ACP has no authentication in this profile.** This is acceptable only while ACP remains a private child stdio transport. The Overcode local bridge must enforce its own extension-client authentication and origin/process policy.

## Escalation rule

Stay on ACP until a concrete accepted V1 requirement cannot be represented. If the blocker is transcript replay, exact queue editing/steering, DSH-specific plans/todos/terminals/cards, user-question waterfalls, or first-class subagent history, evaluate the Remote Host/Client API as a **DeepSeek-only enhanced adapter**. Keep it behind the same `AgentRuntime` interface, pin the exact DSH tag, import the official generated Client contributions rather than reverse-engineering HTTP frames, and treat the larger dependency surface as version-locked.

Do not combine ACP and Remote against the same live Session in V1. Their ownership, activity-settlement, and projection semantics differ; dual-driving one agent would make causal event ownership ambiguous.

## Primary sources

- [DeepSeek Harness release `dsh-v0.1.2-alpha.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.1)
- [DeepSeek Harness architecture and profiles](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/docs/architecture.md)
- [DSH ACP v1 package contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/README.md)
- [DSH ACP implementation](https://github.com/deepseek-ai/deepseek-harness/tree/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/acp/acp/src)
- [DSH SDK client contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/sdk/client/README.md)
- [DSH SDK protocol contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/sdk/protocol/README.md)
- [DSH API Remotes contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/remotes/README.md)
- [DSH API Gateway contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/gateway/README.md)
- [DSH Session Controller Remote methods](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/packages/api/session-controller/src/index.ts)
- [DSH core Agent Host API](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158c3a752a658978873241fdf8e2bbc/docs/subsystems/core.md)
- [ACP TypeScript SDK 1.4.0 source](https://github.com/agentclientprotocol/typescript-sdk/tree/e6463f444093ed7c5f1cc937c3f32afb5853e906)
- [ACP v1 generated schema types used by the SDK](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/schema/types.gen.ts)
