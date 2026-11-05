import { expect, it } from "vitest";
import { writeOutput } from "./output.js";

it("bounds parser work for a large ANSI/Unicode snapshot and completes after its last chunk", () => {
  const writes: { data: string; done: (() => void) | undefined }[] = [];
  const terminal = { write(data: string | Uint8Array, done?: () => void) { writes.push({ data: String(data), done }); } };
  const data = "\x1b[42m" + "界👋".repeat(30000) + "\x1b[0m";
  let completed = false;
  writeOutput(terminal, data, () => { completed = true; });
  expect(writes.map(write => write.data).join("")).toBe(data);
  expect(writes.every(write => write.data.length <= 8192 && !/[\ud800-\udbff]$/u.test(write.data) && !/^[\udc00-\udfff]/u.test(write.data))).toBe(true);
  for (const write of writes.slice(0, -1)) write.done?.();
  expect(completed).toBe(false);
  writes.at(-1)!.done!();
  expect(completed).toBe(true);
  writes.length = 0;
  writeOutput(terminal, "", () => {});
  expect(writes).toHaveLength(1);
  expect(writes[0]!.done).toBeTypeOf("function");
});
