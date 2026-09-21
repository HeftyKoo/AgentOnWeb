/** Attempt every cleanup step, then report all failures to the shutdown caller. */
export async function cleanup(steps: Iterable<() => void | Promise<void>>): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try { await step(); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "Terminal host shutdown failed.");
}
