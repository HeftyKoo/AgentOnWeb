import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Read the live shell's cwd, without executing a command inside its PTY. */
export async function processDirectory(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "linux") return await readlink(`/proc/${pid}/cwd`);
    if (process.platform === "darwin") {
      const { stdout } = await run("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
        timeout: 2000,
        maxBuffer: 64 * 1024,
      });
      return stdout.split("\n").find(line => line.startsWith("n/"))?.slice(1);
    }
  } catch {
    // Exited or inaccessible processes have no reliable current directory.
  }
  return undefined;
}
