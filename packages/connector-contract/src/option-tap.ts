interface OptionKeyEvent {
  readonly key: string;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/** Recognize a bare Option/Alt press and release, never a keyboard shortcut. */
export class OptionTapTracker {
  #pressed = false;

  keydown(event: OptionKeyEvent): void {
    this.#pressed = this.#isBareAlt(event);
  }

  keyup(event: OptionKeyEvent): boolean {
    const tapped = this.#pressed && this.#isBareAlt(event);
    this.reset();
    return tapped;
  }

  reset(): void {
    this.#pressed = false;
  }

  #isBareAlt(event: OptionKeyEvent): boolean {
    return (
      event.key === "Alt" && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.shiftKey
    );
  }
}
