import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface NativeSelection {
  sessionId?: string;
  subagentAddress?: { parentSessionId: string; childSessionId: string; mode: "one-shot" | "continuable" };
}
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;

/** A DSH-owned navigation bookmark, not a session cache or agent manager. */
export function parseSelection(value: unknown): NativeSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid native view selection.");
  const selection = value as Record<string, unknown>;
  if (selection.sessionId === undefined) {
    if (Object.keys(selection).length) throw new Error("Invalid empty selection.");
    return {};
  }
  if (!isId(selection.sessionId)) throw new Error("Invalid session selection.");
  if (selection.subagentAddress === undefined) return { sessionId: selection.sessionId };
  const address = selection.subagentAddress as Record<string, unknown> | null;
  if (!address || !isId(address.parentSessionId) || address.childSessionId !== selection.sessionId
    || (address.mode !== "one-shot" && address.mode !== "continuable")) throw new Error("Invalid native subagent address.");
  return { sessionId: selection.sessionId, subagentAddress: {
    parentSessionId: address.parentSessionId, childSessionId: selection.sessionId, mode: address.mode,
  } };
}

export class NativeViewState {
  #selection: NativeSelection | null;
  #writes: Promise<void> = Promise.resolve();
  private constructor(readonly directory: string, selection: NativeSelection | null) { this.#selection = selection; }
  static async open(directory: string): Promise<NativeViewState> {
    let selection: NativeSelection | null = null;
    try { selection = parseSelection(JSON.parse(await readFile(join(directory, "native-view.json"), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return new NativeViewState(directory, selection);
  }
  snapshot(): { selection: NativeSelection | null } { return { selection: this.#selection }; }
  set(value: unknown): Promise<void> {
    const selection = parseSelection(value);
    const write = async () => {
      const temporary = join(this.directory, `native-view.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(selection) + "\n", { mode: 0o600 });
      await rename(temporary, join(this.directory, "native-view.json"));
      this.#selection = selection;
    };
    this.#writes = this.#writes.catch(() => {}).then(write);
    return this.#writes;
  }
}
