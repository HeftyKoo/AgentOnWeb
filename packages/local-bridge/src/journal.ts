import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentEvent } from "@overcode/runtime-api";

export class EventJournal {
  readonly #path: string;
  #pending = Promise.resolve();

  constructor(directory: string) {
    this.#path = join(directory, "runtime-events.jsonl");
  }

  append(event: AgentEvent): Promise<void> {
    this.#pending = this.#pending.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      await appendFile(this.#path, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    });
    return this.#pending;
  }

  flush(): Promise<void> {
    return this.#pending;
  }
}
