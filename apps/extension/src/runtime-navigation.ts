/** Follow the visible runtime order; a single runtime has no alternate target. */
export function nextRuntimeId(runtimes: readonly { readonly id: string }[], currentId?: string): string | undefined {
  if (runtimes.length < 2) return;
  const index = runtimes.findIndex(runtime => runtime.id === currentId);
  return runtimes[(index + 1) % runtimes.length]?.id;
}
