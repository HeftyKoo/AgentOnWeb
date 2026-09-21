import { browser } from "./browser-api.js";
import { isLocalSurfaceUrl } from "@agentonweb/connector-contract";

// Load the native workspace from an extension document, keeping the
// website's HTTPS document separate from the authorized loopback surface.
const params = new URLSearchParams(location.hash.slice(1));
const url = params.get("url");
const nonce = params.get("nonce");
const parentOrigin = params.get("parent");
async function initialize() {
  if (url && isLocalSurfaceUrl(url) && nonce && /^[a-z0-9-]{1,80}$/iu.test(nonce)
    && parentOrigin && /^https?:\/\//u.test(parentOrigin) && new URL(parentOrigin).origin === parentOrigin) {
    const nativeOrigin = new URL(url).origin;
    const frame = document.createElement("iframe");
    document.documentElement.style.cssText = "height:100%;background:transparent;color-scheme:dark";
    document.body.style.cssText = "margin:0;height:100%;background:transparent";
    frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:transparent";
    frame.title = "Native coding workspace";
    frame.allow = "clipboard-read; clipboard-write";
    frame.name = `agentonweb:${nonce}`;
    const nativeUrl = new URL(url);
    nativeUrl.hash = new URLSearchParams({ agentonweb: nonce }).toString();
    let modeMessage: unknown;
    let opacityMessage: unknown;
    let loaded = false;
    const post = (message: unknown) => { if (loaded) frame.contentWindow?.postMessage(message, nativeOrigin); };
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || message.nonce !== nonce) return;
      if (event.source === window.parent && event.origin === parentOrigin && message.source === "agentonweb-extension") {
        if (message.type === "mode.set" && ["watch", "chill", "focus"].includes(message.mode)) {
          modeMessage = message;
          post(message);
        } else if (message.type === "opacity.set" && typeof message.opacity === "number" && message.opacity >= 0 && message.opacity <= 1) {
          opacityMessage = message;
          post(message);
        }
      } else if (event.source === frame.contentWindow && event.origin === nativeOrigin
        && message.source === "agentonweb-surface" && ["site-pass.option-tap", "surface.output"].includes(message.type)) {
        window.parent.postMessage({ source: "agentonweb-surface", type: message.type, nonce }, parentOrigin);
      }
    });
    frame.addEventListener("load", () => {
      loaded = true;
      post({ source: "agentonweb-extension", type: "surface.ready", nonce });
      if (modeMessage) post(modeMessage);
      if (opacityMessage) post(opacityMessage);
    });
    // The extension document can finish loading while this authorization is
    // pending. Buffer its parent's initial presentation before awaiting it;
    // only an approved document may load the native workspace itself.
    const approval = await browser.runtime.sendMessage({ source: "agentonweb-native", type: "surface.authorize", url, nonce });
    if (!approval?.ok) return;
    frame.src = nativeUrl.href;
    document.body.append(frame);
  }

}
void initialize().catch(() => {});
