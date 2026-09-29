import { mkdir, open, readFile, rmdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/** One host per state directory: a second launch must not steal the runtime identity. */
export async function lockHost(directory: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "host.pid");
  const guard = join(directory, "host.pid.guard");

  // Serialize the complete read/remove/create sequence, including release.
  // Never reclaim this guard by age: a slow or suspended process may still own
  // it. An interrupted update needs explicit recovery instead of risking two hosts.
  async function update<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await mkdir(guard, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      throw new Error(
        `A terminal host lock update is in progress. If this persists, remove ${guard} only after confirming no terminal host is running.`,
      );
    }
    try {
      return await operation();
    } finally {
      await rmdir(guard);
    }
  }

  const identity = await update(async () => {
    let contents: string | undefined;
    try {
      contents = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (contents !== undefined) {
      const pid = Number(contents);
      if (!/^[1-9]\d*$/u.test(contents) || !Number.isSafeInteger(pid)) {
        throw new Error(
          `Invalid terminal host PID file: ${path}. Remove it only after confirming no terminal host is running.`,
        );
      }
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        alive = false;
      }
      if (alive) {
        throw new Error(
          `A terminal host is already running for this runtime (PID ${pid}). Connect to it, or stop it before starting another.`,
        );
      }
      await unlink(path);
    }
    const file = await open(path, "wx", 0o600);
    try {
      await file.writeFile(String(process.pid));
      return await file.stat();
    } finally {
      await file.close();
    }
  });

  let released = false;
  return async () => {
    if (released) return;
    await update(async () => {
      try {
        const current = await stat(path);
        if (
          current.dev === identity.dev &&
          current.ino === identity.ino &&
          (await readFile(path, "utf8")) === String(process.pid)
        )
          await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      released = true;
    });
  };
}
