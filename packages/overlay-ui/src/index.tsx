import { useMemo, useState, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OvercodeMode, OvercodeSnapshot } from "@overcode/core";
import type { AgentEvent, ApprovalChoice } from "@overcode/runtime-api";

export interface OverlayViewState extends OvercodeSnapshot {
  readonly paired: boolean;
  readonly endpoint: string;
  readonly error?: string;
}

export interface OverlayActions {
  readonly pair: (endpoint: string, pairingCode: string) => void;
  readonly createSession: (workspacePath: string) => void;
  readonly sendPrompt: (prompt: string) => void;
  readonly cancel: () => void;
  readonly setMode: (mode: OvercodeMode) => void;
  readonly respondToApproval: (choice: ApprovalChoice) => void;
}

export interface OverlayProps {
  readonly state: OverlayViewState;
  readonly actions: OverlayActions;
}

export function mountOverlay(
  container: Element | DocumentFragment,
  props: OverlayProps,
): { render: (nextProps: OverlayProps) => void; destroy: () => void } {
  const root: Root = createRoot(container);
  root.render(<OvercodeOverlay {...props} />);
  return {
    render(nextProps) {
      root.render(<OvercodeOverlay {...nextProps} />);
    },
    destroy() {
      root.unmount();
    },
  };
}

export function OvercodeOverlay({ state, actions }: OverlayProps) {
  const [prompt, setPrompt] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [endpoint, setEndpoint] = useState(state.endpoint);
  const [workspacePath, setWorkspacePath] = useState("");
  const agentIsRunning = ["thinking", "working", "running-command", "needs-approval"].includes(
    state.status,
  );
  const tools = useMemo(
    () => state.timeline.filter((item) => item.event.type.startsWith("tool.")),
    [state.timeline],
  );

  function submitPair(event: FormEvent) {
    event.preventDefault();
    if (endpoint.trim() && pairingCode.trim()) actions.pair(endpoint.trim(), pairingCode.trim());
  }

  function submitWorkspace(event: FormEvent) {
    event.preventDefault();
    if (workspacePath.trim()) actions.createSession(workspacePath.trim());
  }

  function submitPrompt(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || !state.session) return;
    actions.sendPrompt(value);
    setPrompt("");
  }

  if (state.mode === "watch") {
    return (
      <div className="overcode-watch-stack">
        {state.pendingApproval ? (
          <button className="watch-alert" onClick={() => actions.setMode("chill")}>
            <span className="watch-alert-icon">!</span>
            <span><strong>Agent needs approval</strong><small>Open Overcode to review</small></span>
          </button>
        ) : null}
        <button className="watch-pill" onClick={() => actions.setMode("chill")}>
          <StatusDot status={state.status} />
          <span>Agent {statusLabel(state.status)}</span>
          <kbd>⌃⇧O</kbd>
        </button>
      </div>
    );
  }

  return (
    <section className={`overcode-shell mode-${state.mode}`} aria-label="Overcode coding agent">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-glyph" aria-hidden="true"><i /><i /></span>
          <span><strong>OVERCODE</strong><small>Your coding agent, everywhere</small></span>
        </div>
        <div className="workspace-chip">
          <span className="branch-icon">⌘</span>
          <span>{state.workspace?.label ?? "No workspace"}</span>
          {state.workspace ? <small>{state.workspace.path}</small> : null}
        </div>
        <ModeSwitcher mode={state.mode} onChange={actions.setMode} />
        <div className="connection-chip">
          <StatusDot status={state.connection === "connected" ? state.status : "failed"} />
          {state.connection === "connected" ? "LOCAL" : state.connection.toUpperCase()}
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="rail">
          <div className="rail-section">
            <span className="eyebrow">ACTIVE AGENT</span>
            <div className="agent-card">
              <span className="agent-orbit"><span /></span>
              <div><strong>DeepSeek Harness</strong><small>{statusLabel(state.status)}</small></div>
            </div>
          </div>

          <div className="rail-section">
            <span className="eyebrow">SESSION</span>
            <dl className="session-facts">
              <div><dt>STATE</dt><dd>{statusLabel(state.status)}</dd></div>
              <div><dt>TOOLS</dt><dd>{tools.length.toString().padStart(2, "0")}</dd></div>
              <div><dt>MODE</dt><dd>{state.mode.toUpperCase()}</dd></div>
            </dl>
          </div>

          <div className="rail-section rail-log">
            <span className="eyebrow">RECENT ACTIVITY</span>
            {tools.slice(-4).reverse().map((item) => (
              <div className="mini-tool" key={item.id}>
                <span>{item.event.type === "tool.failed" ? "×" : "✓"}</span>
                <span>{toolName(item.event)}</span>
              </div>
            ))}
            {tools.length === 0 ? <p className="empty-rail">Tool activity will appear here.</p> : null}
          </div>

          <div className="site-hint"><kbd>⌥ HOLD</kbd><span>Interact with website</span></div>
        </aside>

        <main className="agent-workspace">
          <div className="agent-header">
            <div>
              <span className="eyebrow">CODING SESSION</span>
              <h1>{state.session?.title ?? "Ready when you are"}</h1>
            </div>
            {agentIsRunning ? <button className="stop-button" onClick={actions.cancel}>■ Stop</button> : null}
          </div>

          {!state.paired ? (
            <SetupPanel
              endpoint={endpoint}
              pairingCode={pairingCode}
              setEndpoint={setEndpoint}
              setPairingCode={setPairingCode}
              onSubmit={submitPair}
              {...(state.error ? { error: state.error } : {})}
            />
          ) : !state.session ? (
            <WorkspacePanel
              workspacePath={workspacePath}
              setWorkspacePath={setWorkspacePath}
              onSubmit={submitWorkspace}
              {...(state.error ? { error: state.error } : {})}
            />
          ) : (
            <Timeline state={state} />
          )}

          {state.pendingApproval ? (
            <ApprovalPanel
              title={state.pendingApproval.title}
              choices={state.pendingApproval.choices}
              onChoose={actions.respondToApproval}
              {...(state.pendingApproval.description ? { description: state.pendingApproval.description } : {})}
            />
          ) : null}

          <form className="composer" onSubmit={submitPrompt}>
            <span className="prompt-mark">›</span>
            <textarea
              aria-label="Message the coding agent"
              disabled={!state.session}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={state.session ? "Describe what to build or change…" : "Pair and select a workspace to begin"}
              rows={1}
              value={prompt}
            />
            <button disabled={!state.session || !prompt.trim()} type="submit" aria-label="Send prompt">↑</button>
          </form>
        </main>
      </div>
    </section>
  );
}

function ModeSwitcher({ mode, onChange }: { mode: OvercodeMode; onChange: (mode: OvercodeMode) => void }) {
  return (
    <div className="mode-switcher" role="group" aria-label="Display mode">
      {(["chill", "focus", "watch"] as const).map((value) => (
        <button
          aria-pressed={mode === value}
          className={mode === value ? "active" : ""}
          key={value}
          onClick={() => onChange(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: OvercodeSnapshot["status"] }) {
  return <span className={`status-dot status-${status}`} aria-hidden="true" />;
}

function Timeline({ state }: { state: OverlayViewState }) {
  const visibleItems = state.timeline.filter((item) => !item.event.type.startsWith("agent."));
  if (visibleItems.length === 0) {
    return (
      <div className="empty-timeline">
        <span className="empty-prompt">_</span>
        <h2>Agent connected</h2>
        <p>Send a prompt. Overcode will keep the session alive while you navigate.</p>
      </div>
    );
  }
  return (
    <div className="timeline" aria-live="polite">
      {visibleItems.map((item) => <TimelineEvent event={item.event} key={item.id} />)}
      {state.status === "thinking" || state.status === "working" ? (
        <div className="thinking-row"><span /><span /><span /><small>Agent working</small></div>
      ) : null}
    </div>
  );
}

function TimelineEvent({ event }: { event: AgentEvent }) {
  if (event.type === "message.delta" || event.type === "message.completed") {
    return (
      <article className={`message message-${event.role}`}>
        <span className="message-role">{event.role === "assistant" ? "AGENT" : event.role.toUpperCase()}</span>
        <p>{event.text}</p>
      </article>
    );
  }
  if (event.type.startsWith("tool.")) {
    return (
      <article className={`tool-row ${event.type}`}>
        <span className="tool-state">{event.type === "tool.failed" ? "×" : event.type === "tool.started" ? "●" : "✓"}</span>
        <div><strong>{toolName(event)}</strong><small>{"summary" in event ? event.summary : undefined}</small></div>
        <code>{event.type.replace("tool.", "")}</code>
      </article>
    );
  }
  return null;
}

function SetupPanel(props: {
  error?: string;
  endpoint: string;
  pairingCode: string;
  setEndpoint: (value: string) => void;
  setPairingCode: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="setup-panel">
      <span className="setup-index">01</span>
      <span className="eyebrow">SECURE LOCAL PAIRING</span>
      <h2>Connect your coding runtime.</h2>
      <p>Run the Overcode bridge beside DeepSeek Harness, then enter its one-time pairing code.</p>
      <form onSubmit={props.onSubmit}>
        <label>Bridge endpoint<input value={props.endpoint} onChange={(event) => props.setEndpoint(event.target.value)} /></label>
        <label>Pairing code<input autoComplete="one-time-code" inputMode="numeric" placeholder="000 000" value={props.pairingCode} onChange={(event) => props.setPairingCode(event.target.value)} /></label>
        <button type="submit">Pair local bridge <span>→</span></button>
      </form>
      {props.error ? <p className="form-error">{props.error}</p> : null}
    </div>
  );
}

function WorkspacePanel(props: {
  error?: string;
  workspacePath: string;
  setWorkspacePath: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="setup-panel">
      <span className="setup-index">02</span>
      <span className="eyebrow">WORKSPACE</span>
      <h2>Choose where the agent works.</h2>
      <p>The path is validated by the local bridge and never exposed to the website.</p>
      <form onSubmit={props.onSubmit}>
        <label>Local workspace path<input autoFocus placeholder="/Users/you/Project/example" value={props.workspacePath} onChange={(event) => props.setWorkspacePath(event.target.value)} /></label>
        <button type="submit">Start coding session <span>→</span></button>
      </form>
      {props.error ? <p className="form-error">{props.error}</p> : null}
    </div>
  );
}

function ApprovalPanel(props: {
  title: string;
  description?: string;
  choices: readonly ApprovalChoice[];
  onChoose: (choice: ApprovalChoice) => void;
}) {
  return (
    <aside className="approval-panel">
      <span className="approval-icon">!</span>
      <div><strong>{props.title}</strong>{props.description ? <p>{props.description}</p> : null}</div>
      <div className="approval-actions">
        {props.choices.map((choice) => <button className={`choice-${choice.kind}`} key={choice.id} onClick={() => props.onChoose(choice)}>{choice.label}</button>)}
      </div>
    </aside>
  );
}

function statusLabel(status: OvercodeSnapshot["status"]): string {
  return status.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function toolName(event: AgentEvent): string {
  return "toolName" in event ? event.toolName : "Tool call";
}
