import terminalIcon from "@phosphor-icons/core/regular/terminal.svg?raw";
import brainIcon from "@phosphor-icons/core/regular/brain.svg?raw";
import caretIcon from "@phosphor-icons/core/regular/caret-up.svg?raw";
import workspaceIcon from "@phosphor-icons/core/regular/squares-four.svg?raw";
import type { SurfaceViewState } from "./shared.js";

const RUNTIME_ICONS = new Map([
  ["terminal", terminalIcon],
  ["deepseek-harness", brainIcon],
]);

/** Presentation only: activation remains owned by the background runtime. */
export function createRuntimePicker(onSelect: (id: string) => void, onOpen: (open: boolean) => void) {
  const element = document.createElement("div");
  element.className = "runtime-switch";
  element.hidden = true;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "runtime-current";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "agentonweb-runtime-options");
  const icon = document.createElement("span");
  icon.className = "runtime-symbol";
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "runtime-name";
  const caret = document.createElement("span");
  caret.className = "runtime-caret";
  caret.innerHTML = caretIcon;
  caret.setAttribute("aria-hidden", "true");
  trigger.append(icon, label, caret);
  const options = document.createElement("div");
  options.id = "agentonweb-runtime-options";
  options.className = "runtime-options";
  options.setAttribute("aria-label", "Local workspaces");
  options.hidden = true;
  element.append(trigger, options);
  function setOpen(open: boolean) {
    options.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    onOpen(open);
  }
  trigger.addEventListener("click", () => setOpen(options.hidden));
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !options.hidden) {
      event.stopPropagation();
      setOpen(false);
      trigger.focus({ preventScroll: true });
    }
  });
  element.addEventListener("animationend", (event) => {
    if (event.animationName === "runtime-decode") element.classList.remove("is-switching");
  });
  let previousId: string | undefined;
  const optionButtons = new Map<string, HTMLButtonElement>();
  return {
    element,
    trigger,
    options,
    setOpen,
    render(state: SurfaceViewState) {
      const runtimes = state.runtimes ?? [];
      const current = runtimes.find(item => item.id === state.runtimeId);
      element.hidden = runtimes.length === 0;
      const name = current?.displayName ?? "Workspaces";
      const changed = previousId !== undefined && current !== undefined && previousId !== current.id;
      if (previousId !== current?.id || !icon.childElementCount) {
        icon.innerHTML = (current && RUNTIME_ICONS.get(current.id)) ?? workspaceIcon;
      }
      label.textContent = name;
      trigger.title = name;
      trigger.setAttribute("aria-label", `${name}${current?.newOutput ? ", new output" : ""}`);
      trigger.dataset.unread = String(runtimes.some(item => item.newOutput));
      if (changed) {
        setOpen(false);
        element.classList.remove("is-switching");
        // Restart the finite effect without changing any box dimensions.
        void trigger.offsetWidth;
        element.classList.add("is-switching");
      }
      previousId = current?.id;
      const ids = new Set(runtimes.map(runtime => runtime.id));
      for (const [id, button] of optionButtons) {
        if (ids.has(id)) continue;
        if (button.matches(":focus")) trigger.focus({ preventScroll: true });
        button.remove();
        optionButtons.delete(id);
      }
      runtimes.forEach((runtime, index) => {
        let button = optionButtons.get(runtime.id);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.addEventListener("click", () => {
            setOpen(false);
            trigger.focus({ preventScroll: true });
            if (runtime.id !== previousId) onSelect(runtime.id);
          });
          optionButtons.set(runtime.id, button);
        }
        button.textContent = `${runtime.displayName}${runtime.newOutput ? " •" : ""}`;
        button.setAttribute("aria-label", `${runtime.displayName}${runtime.newOutput ? ", new output" : ""}`);
        button.setAttribute("aria-pressed", String(runtime.id === state.runtimeId));
        // Metadata updates must not detach a focused option. Move nodes only
        // when the runtime list itself changes its membership or order.
        if (options.children[index] !== button) options.insertBefore(button, options.children[index] ?? null);
      });
    },
  };
}
