import { browser, extensionURL } from "../../src/browser-api.js";
const status = document.querySelector<HTMLElement>("#status")!;
document.querySelector("#demo")!.addEventListener("click", () => {
  void browser.tabs.create({ url: extensionURL("/demo.html") });
});
document.querySelector("#show")!.addEventListener("click", async () => {
  try {
    const result = await browser.runtime.sendMessage({ source: "agentonweb-popup", type: "surface.toggle" });
    status.textContent = result?.ok ? "Workspace toggled. Close this menu to use it." : "Open a normal website and allow AgentOnWeb website access in Safari Settings. You can try the demo now.";
  } catch { status.textContent = "Reload the website after enabling the extension, or try the demo."; }
});
document.querySelector("#local")!.addEventListener("click", async () => {
  try {
    const allowed = await browser.permissions.request({ origins: ["http://localhost/*", "http://127.0.0.1/*"] });
    status.textContent = allowed ? "Local access allowed. Start dsh web, then connect from the website dock." : "Local access was not allowed. The offline demo remains available.";
  } catch { status.textContent = "Open Safari Settings → Websites to check local workspace access."; }
});
