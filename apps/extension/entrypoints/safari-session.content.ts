import { defineContentScript } from "wxt/utils/define-content-script";
import { installSafariSessionGate } from "../src/safari-session-gate.js";

export default defineContentScript({
  include: ["safari"],
  matches: ["http://localhost/*"],
  allFrames: true,
  runAt: "document_idle",
  main() { void installSafariSessionGate(); },
});
