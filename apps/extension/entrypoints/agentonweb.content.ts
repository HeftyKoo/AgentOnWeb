import { defineContentScript } from "wxt/utils/define-content-script";
import "../src/content.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {},
});
