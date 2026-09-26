import { createDock } from "./dock.js";
import { DEFAULT_SURFACE_OPACITY, DoubleTapLatch } from "./interaction.js";
import type { SurfaceViewState } from "./shared.js";
import overlayStyles from "./overlay.css?inline";
import demoStyles from "./demo.css?inline";

const style = document.createElement("style");
style.textContent = overlayStyles + demoStyles;
document.head.append(style);
const container = document.querySelector<HTMLElement>("#demo")!;
container.innerHTML = `
<main class="demo-website"><p class="eyebrow">AGENTONWEB · INTERACTIVE DEMO</p><h1>A workspace over your website.</h1><p>This is a bundled sample website. The actual AgentOnWeb presentation controls work here without an account, API key, internet connection, or local DSH installation.</p><h2>Try the website</h2><p>In Watch mode, the workspace disappears and this page remains interactive.</p><button id="counter">Website counter: 0</button><button id="open-workspace">Open sample workspace</button><h2>What is included</h2><p>Explore two populated sample conversations, inspect sample tool results, edit a scratchpad, and try Chill, Focus, Watch, and opacity controls.</p><p>The conversations and tool results are bundled examples, not live AI responses. Connect your own DSH workspace for live models, tools, and approvals.</p><a href="https://heftykoo.github.io/AgentOnWeb/">Setup &amp; support</a></main>
<div class="agentonweb-root" data-active="true" data-has-surface="true"><section class="surface-shell"><article class="runtime-frame demo-workspace"><header><div><strong>AgentOnWeb</strong><span>Interactive demo · offline sample content</span></div><button id="watch">Return to website</button></header><div class="demo-layout"><nav aria-label="Demo workspace"><h2>Sample conversations</h2><button data-page="review" aria-pressed="true">Review a page layout</button><button data-page="test">Fix an empty-list bug</button><h2>Workspace</h2><button data-page="scratchpad">Scratchpad</button><button data-page="about">Connection &amp; help</button></nav><section id="demo-content" aria-live="polite"></section></div></article></section></div>`;
const pages: Record<string, string> = {
  review: `<p class="eyebrow">SAMPLE CONVERSATION · PAGE LAYOUT</p><h1>Make a pricing page easier to scan</h1><div class="message"><b>You</b><p>Review this pricing card and suggest a clearer hierarchy.</p></div><div class="message"><b>Sample assistant response</b><p>Put the plan name first, show the monthly price directly below it, and keep the primary action near the features. Give the annual billing note a quieter style so it does not compete with the price.</p></div><details open><summary>Sample tool result · inspect pricing-card.html</summary><pre>&lt;article class="plan"&gt;
  &lt;h2&gt;Starter&lt;/h2&gt;
  &lt;p class="price"&gt;$12 / month&lt;/p&gt;
  &lt;ul&gt;&lt;li&gt;3 projects&lt;/li&gt;&lt;li&gt;Email support&lt;/li&gt;&lt;/ul&gt;
  &lt;button&gt;Choose Starter&lt;/button&gt;
&lt;/article&gt;</pre></details><p>Try Chill to see the website through this workspace. Adjust opacity with the dock slider. Focus makes the workspace opaque; Watch returns to the website.</p>`,
  test: `<p class="eyebrow">SAMPLE CONVERSATION · BUG FIX</p><h1>Handle an empty item list</h1><div class="message"><b>You</b><p>The average function returns NaN when the input list is empty. Show a fix and a regression test.</p></div><div class="message"><b>Sample assistant response</b><p>The sum is zero and the list length is zero, so dividing produces NaN. Define the empty-list result explicitly before calculating the average.</p></div><details open><summary>Sample patch · average.ts</summary><pre>export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) =&gt; a + b, 0) / values.length;
}</pre></details><details><summary>Sample test result · 2 tests passed</summary><pre>average([]) → 0        PASS
average([2, 4]) → 3    PASS</pre><p>This is bundled example output; no command is executed on your Mac.</p></details>`,
  scratchpad: `<p class="eyebrow">LOCAL INTERACTIVE SCRATCHPAD</p><h1>Try editing while the website stays visible</h1><p>Changes stay in this demo tab and reset when it closes. Nothing is sent to a model or written to your files.</p><label for="notes">Notes</label><textarea id="notes" rows="10"></textarea><p id="note-count" role="status"></p><button id="reset-notes">Reset sample notes</button>`,
  about: `<p class="eyebrow">CONNECTION &amp; HELP</p><h1>From the demo to your own workspace</h1><p><strong>Current connection:</strong> Offline demonstration. No model provider is connected.</p><p>The demo uses AgentOnWeb's presentation controls with bundled sample content. This sample illustrates the DSH workspace. Connect DeepSeek Harness for its live conversations, models, tools, approvals and plugins. The source build also supports Local terminal for running your installed command-line tools; it requires a separate local host.</p><ol><li>Enable AgentOnWeb in Safari Settings → Extensions.</li><li>Install DeepSeek Harness and add the AgentOnWeb plugin:<pre>dsh plugin --profile web add @agentonweb/dsh-surface@0.1.1</pre></li><li>Configure your provider in DSH, then run <code>dsh web</code>.</li><li>Visit a normal website and allow the extension access. Use the toolbar's Allow local workspace access button, then Connect in the page dock.</li><li>Approve the connection in DSH and follow Safari's local-session prompts.</li></ol><p>If the toolbar looks grey, open its menu and choose Try interactive demo. Protected Safari pages cannot host a page overlay.</p><a href="https://heftykoo.github.io/AgentOnWeb/">Get support and setup instructions</a>`,
};
let notes = "Pricing page review\n\n- Keep the plan name above the price.\n- Place the primary action near the feature list.\n- Test the empty-list case before calculating averages.";
const initialNotes = notes;
function showPage(name: string): void {
  document.querySelector<HTMLElement>("#demo-content")!.innerHTML = pages[name] ?? pages.review!;
  document.querySelectorAll<HTMLElement>("[data-page]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.page === name)));
  const input = document.querySelector<HTMLTextAreaElement>("#notes");
  if (input) {
    const update = () => { notes = input.value; document.querySelector("#note-count")!.textContent = `${notes.length} characters · saved in this tab only`; };
    input.value = notes; update(); input.addEventListener("input", update);
    document.querySelector("#reset-notes")!.addEventListener("click", () => { input.value = initialNotes; update(); });
  }
}
document.querySelectorAll<HTMLElement>("[data-page]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page!)));
const root = document.querySelector<HTMLElement>(".agentonweb-root")!;
const frame = document.querySelector<HTMLElement>(".demo-workspace")!;
let state: SurfaceViewState = { mode: "focus", opacity: DEFAULT_SURFACE_OPACITY, connection: "disconnected" };
const dock = createDock({ localModeShortcuts: true });
function render(): void {
  root.dataset.mode = state.mode;
  root.dataset.sitePass = "false";
  optionLatch?.reset();
  frame.style.opacity = state.mode === "chill" ? String(state.opacity) : "";
  frame.inert = state.mode === "watch";
  dock.render(state);
}
dock.onMode = mode => { state = { ...state, mode }; render(); };
dock.onOpacity = opacity => { state = { ...state, opacity }; render(); };
dock.onOpacityPreview = opacity => { if (state.mode === "chill") frame.style.opacity = String(opacity); };
dock.setExpanded(true);
root.querySelector(".surface-shell")!.append(dock.element);
document.querySelector("#watch")!.addEventListener("click", () => dock.onMode("watch"));
document.querySelector("#open-workspace")!.addEventListener("click", () => dock.onMode("chill"));
let count = 0;
document.querySelector("#counter")!.addEventListener("click", event => { (event.currentTarget as HTMLElement).textContent = `Website counter: ${++count}`; });
const optionLatch = new DoubleTapLatch();
document.addEventListener("keydown", event => {
  if (event.key === "Escape") dock.onMode("watch");

  if (event.key === "Alt" && !event.repeat && state.mode === "chill") {
    const pass = optionLatch.tap(event.timeStamp);
    if (pass !== undefined) root.dataset.sitePass = String(pass);
  }
});
showPage("review"); render();
