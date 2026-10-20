import { isMacPlatform } from "@agentonweb/connector-contract";
import type { Terminal } from "@xterm/xterm";

type SelectionTerminal = Pick<Terminal, "focus"> & { readonly modes: Pick<Terminal["modes"], "mouseTrackingMode"> };

/** Distinguish text drags from TUI clicks before forwarding a mouse press. */
export function installMouseSelection(terminal: SelectionTerminal, container: HTMLElement, mac = isMacPlatform()) {
  const document = container.ownerDocument;
  const window = document.defaultView!;
  let forwarding = false;
  let cancelGesture: (() => void) | undefined;
  function forward(target: EventTarget, event: MouseEvent, select = false) {
    forwarding = true;
    try {
      target.dispatchEvent(new window.MouseEvent(event.type, {
        bubbles: true, cancelable: true, view: window, detail: event.detail,
        clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
        button: event.button, buttons: event.buttons,
        ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        altKey: event.altKey || (select && mac), shiftKey: event.shiftKey || (select && !mac),
      }));
    } finally {
      forwarding = false;
    }
  }
  container.addEventListener("mousedown", event => {
    if (forwarding || event.button !== 0 || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey
      || terminal.modes.mouseTrackingMode === "none" || !(event.target instanceof window.Element)
      || !event.target.closest(".xterm-screen")) return;
    cancelGesture?.();
    event.preventDefault();
    event.stopImmediatePropagation();
    terminal.focus();
    const target = event.target!;
    // Let xterm perform its own word/line selection for double/triple clicks.
    if (event.detail >= 2) { forward(target, event, true); return; }
    let selecting = false;
    const cleanup = () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mouseup", up, true);
      window.removeEventListener("blur", cleanup);
      cancelGesture = undefined;
    };
    const move = (next: MouseEvent) => {
      if (selecting || Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) < 3) return;
      selecting = true;
      // Use xterm's native selection, including wide characters and scrolling.
      forward(target, event, true);
    };
    const up = (next: MouseEvent) => {
      if (next.button !== 0) return;
      cleanup();
      if (selecting) return;
      next.preventDefault();
      next.stopImmediatePropagation();
      // A click still reaches the app, with its original coordinates/modifiers.
      forward(target, event);
      forward(next.target ?? target, next);
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("mouseup", up, true);
    window.addEventListener("blur", cleanup);
    cancelGesture = cleanup;
  }, true);
}
