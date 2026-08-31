export const DEFAULT_SURFACE_OPACITY = 0.6;
export const MIN_SURFACE_OPACITY = 0.2;
export const MAX_SURFACE_OPACITY = 0.9;
export const OPTION_DOUBLE_TAP_WINDOW_MS = 360;

export function normalizeSurfaceOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SURFACE_OPACITY;
  const clamped = Math.min(MAX_SURFACE_OPACITY, Math.max(MIN_SURFACE_OPACITY, value));
  return Math.round(clamped * 100) / 100;
}

export class DoubleTapLatch {
  #active = false;
  #firstTapAt: number | undefined;

  constructor(readonly windowMs = OPTION_DOUBLE_TAP_WINDOW_MS) {}

  tap(now: number): boolean | undefined {
    if (this.#firstTapAt !== undefined && now >= this.#firstTapAt && now - this.#firstTapAt <= this.windowMs) {
      this.#firstTapAt = undefined;
      this.#active = !this.#active;
      return this.#active;
    }
    this.#firstTapAt = now;
    return undefined;
  }

  reset(active = false): void {
    this.#active = active;
    this.#firstTapAt = undefined;
  }
}
