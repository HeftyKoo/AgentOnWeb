import type { AgentOnWebMode } from "@agentonweb/connector-contract";

export interface ModeShortcutBinding {
  readonly name?: string;
  readonly shortcut?: string;
}

export function commandMode(command: string): AgentOnWebMode | undefined {
  switch (command) {
    case "mode-chill": return "chill";
    case "mode-focus": return "focus";
    case "mode-watch": return "watch";
  }
}

// getAll returns the platform's display string, rather than the manifest's
// suggested_key. Accept Control's text/glyph forms without accepting Command.
export function hasDefaultModeShortcut(bindings: readonly ModeShortcutBinding[], mode: AgentOnWebMode, mac: boolean): boolean {
  const digit = mode === "chill" ? "1" : mode === "focus" ? "2" : "3";
  return bindings.some(binding => {
    if (binding.name !== `mode-${mode}`) return false;
    const shortcut = binding.shortcut?.toLowerCase().replace(/⌃/gu, "ctrl").replace(/[+\s]/gu, "");
    return mac ? ["ctrl", "control", "macctrl"].some(modifier => shortcut === modifier + digit) : shortcut === "alt" + digit;
  });
}
