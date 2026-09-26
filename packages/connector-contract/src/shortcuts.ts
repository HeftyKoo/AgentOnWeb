export function isMacPlatform(): boolean {
  const navigator = globalThis.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  return /Mac|iPhone|iPad/iu.test(navigator?.userAgentData?.platform ?? navigator?.platform ?? "");
}

export type SurfaceShortcut = "chill" | "focus" | "watch" | "runtime.toggle";

export function isSurfaceShortcut(value: unknown): value is SurfaceShortcut {
  return value === "chill" || value === "focus" || value === "watch" || value === "runtime.toggle";
}

/** Use physical keys so keyboard layout and modifier-produced text do not change the action. */
export function surfaceShortcut(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "code">, mac = isMacPlatform()): SurfaceShortcut | undefined {
  if (event.metaKey || event.shiftKey || event.isComposing) return;
  if (mac ? (!event.ctrlKey || event.altKey) : (!event.altKey || event.ctrlKey)) return;
  switch (event.code) {
    case "Digit1": return "chill";
    case "Digit2": return "focus";
    case "Digit3": return "watch";
    case "Backquote": return "runtime.toggle";
  }
}
