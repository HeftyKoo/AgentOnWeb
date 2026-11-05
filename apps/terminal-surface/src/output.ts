import type { Terminal } from "@xterm/xterm";
import { splitInput } from "./input.js";

// xterm yields between writes, but cannot yield in the middle of a large
// individual string. Bound snapshot/flood chunks so input gets a turn too.
export function writeOutput(terminal: Pick<Terminal, "write">, data: string, done: () => void) {
  if (data.length <= 8192) { terminal.write(data, done); return; }
  let remaining = data.length;
  for (const chunk of splitInput(data)) {
    remaining -= chunk.length;
    terminal.write(chunk, remaining === 0 ? done : undefined);
  }
}
