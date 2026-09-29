import { parse } from "smol-toml";
import { spawn } from "node:child_process";

const commandArray = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new Error("Codex notify must be an array of strings.");
  return value as string[];
};

/** Preserve comments and all unrelated TOML byte-for-byte, including multiline values. */
export function configureNotify(source: string, node: string, cli: string): string {
  const config = parse(source);
  let previous = config.notify === undefined ? [] : commandArray(config.notify);
  // Reinstallation updates the executable location without nesting forwarders.
  if (previous[2] === "agent-notify" && previous[3] === "--forward" && previous.length === 5)
    previous = commandArray(JSON.parse(previous[4]!));
  const command = [node, cli, "agent-notify", "--forward", JSON.stringify(previous)];
  return replaceNotify(source, command, config.notify !== undefined);
}

/** Restore only our forwarder, never replace a notifier edited after setup. */
export function removeNotify(source: string): string {
  const value = parse(source).notify;
  if (!Array.isArray(value) || value[2] !== "agent-notify" || value[3] !== "--forward" || value.length !== 5) return source;
  const previous = commandArray(JSON.parse(value[4] as string));
  return replaceNotify(source, previous.length ? previous : undefined, true);
}

function replaceNotify(source: string, command: string[] | undefined, exists: boolean): string {
  const assignment = command ? `notify = ${JSON.stringify(command)}\n` : "";
  if (!exists) return assignment + source;
  const lines = source.split(/(?<=\n)/u);
  let lastComplete = 0;
  for (let index = 1; index <= lines.length; index++) {
    let prefix;
    try { prefix = parse(lines.slice(0, index).join("")); } catch { continue; }
    if (Object.hasOwn(prefix, "notify")) {
      const result = lines.slice(0, lastComplete).join("") + assignment + lines.slice(index).join("");
      // Fail without writing if an unusual TOML representation cannot be preserved.
      if (JSON.stringify(parse(result).notify) !== JSON.stringify(command)) throw new Error("Could not update Codex notify safely.");
      return result;
    }
    lastComplete = index;
  }
  throw new Error("Could not locate Codex notify configuration.");
}

export function completionEvent(value: unknown): object | undefined {
  if (!value || typeof value !== "object") return;
  const event = value as Record<string, unknown>;
  if (event.type !== "agent-turn-complete") return;
  return { hook_event_name: "TurnComplete", session_id: event["thread-id"], turn_id: event["turn-id"], cwd: event.cwd };
}

export async function forwardNotification(args: string[], payload: string): Promise<void> {
  if (args[0] !== "--forward" || args.length !== 2) return;
  const command = commandArray(JSON.parse(args[1]!));
  if (!command.length) return;
  await new Promise<void>(resolve => {
    const child = spawn(command[0]!, [...command.slice(1), payload], { stdio: "ignore", shell: false });
    child.on("error", () => resolve());
    child.on("exit", () => resolve());
  });
}
