import { browser } from "./browser-api.js";

export async function installSafariSessionGate(): Promise<void> {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const visitNonce = fragment.get("agentonweb-safari-setup");
  const nonce = visitNonce ?? fragment.get("agentonweb");
  if (!nonce || !/^[a-z0-9-]{1,80}$/iu.test(nonce)) return;
  const send = (type: string) => browser.runtime.sendMessage({ source: "agentonweb-safari-session", type, nonce });
  const response = await send(visitNonce ? "session.is-visit" : "session.prepare").catch(() => undefined);
  if (!response?.ok) return;
  if (!visitNonce && await document.hasStorageAccess()) return;
  // Existing Safari grants can be reactivated without another prompt. The
  // browser rejects a first request without a gesture, so show the controls.
  if (!visitNonce) {
    try { await document.requestStorageAccess(); return; } catch { /* needs a click */ }
  }
  const host = document.createElement("div");
  host.id = "agentonweb-safari-session-gate";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#0a1018d9;font:15px -apple-system,BlinkMacSystemFont,sans-serif;color:#f5f8fb";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = "*{box-sizing:border-box}section{width:min(420px,90vw);padding:28px;background:#111c28;border:1px solid #35505c;border-radius:18px;box-shadow:0 16px 60px #0005}h1{font-size:22px;margin:0 0 12px}p{line-height:1.6;color:#c6d1db;margin:0 0 20px}button{font:inherit;border:0;border-radius:9px;padding:11px 16px;background:#9aebc5;color:#10241c;cursor:pointer;margin:0 8px 8px 0}button.secondary{background:#243544;color:#e7f0f5}button:focus-visible{outline:3px solid white;outline-offset:3px}.error{font-size:13px;margin:12px 0 0;color:#e4c895}";
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "AgentOnWeb Safari session setup");
  const title = document.createElement("h1");
  title.textContent = visitNonce ? "Local workspace ready" : "Allow your local session";
  const copy = document.createElement("p");
  copy.textContent = visitNonce
    ? "Continue to your website, then allow Safari to use this local workspace session there."
    : "Safari needs permission to use your local workspace session on this website. Your session stays on this Mac.";
  const action = document.createElement("button");
  action.textContent = visitNonce ? "Continue to website" : "Allow local session";
  const error = document.createElement("p");
  error.className = "error";
  error.setAttribute("role", "status");
  action.onclick = () => {
    if (visitNonce) {
      void send("session.return").then((result) => { if (result?.ok) host.remove(); });
      return;
    }
    void document.requestStorageAccess().then(() => {
      host.remove();
      location.reload();
    }).catch(() => {
      error.textContent = "First open your local workspace and choose Continue to website. Then try Allow local session again. If you declined Safari’s prompt, you can retry when ready.";
    });
  };
  panel.append(title, copy, action);
  if (!visitNonce) {
    const visit = document.createElement("button");
    visit.className = "secondary";
    visit.textContent = "Open local workspace";
    visit.onclick = () => { void send("session.visit"); };
    panel.append(visit);
  }
  panel.append(error);
  shadow.append(style, panel);
  document.documentElement.append(host);
}
