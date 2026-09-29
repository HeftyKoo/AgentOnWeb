import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  beforeUnlink: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    unlink: async (path: string) => {
      if (path.endsWith("host.pid")) await hooks.beforeUnlink?.();
      return fs.unlink(path);
    },
  };
});
import { lockHost } from "./host-lock.js";
it("rejects a second live host and releases only its own project lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-lock-"));
  try {
    const release = await lockHost(directory);
    await expect(lockHost(directory)).rejects.toThrow("already running");
    await release();
    const second = await lockHost(directory);
    await writeFile(join(directory, "host.pid"), "99999999");
    await second();
    // A process no longer present can be recovered after a host crash.
    await (
      await lockHost(directory)
    )();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("does not let two stale-lock reclaimers replace each other's live lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-lock-race-"));
  await writeFile(join(directory, "host.pid"), "99999999");
  let resume!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const reclaiming = new Promise<void>((resolve) => {
    reached = resolve;
  });
  hooks.beforeUnlink = async () => {
    hooks.beforeUnlink = undefined;
    reached();
    await paused;
  };
  const first = lockHost(directory);
  await reclaiming;
  const second = await lockHost(directory).then(
    (release) => ({ release }),
    (error) => ({ error }),
  );
  resume();
  const results = [
    await first.then(
      (release) => ({ release }),
      (error) => ({ error }),
    ),
    second,
  ];
  try {
    expect(results.filter((result) => "release" in result)).toHaveLength(1);
  } finally {
    hooks.beforeUnlink = undefined;
    for (const result of results) if ("release" in result) await result.release();
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(["", "broken", "1.5", "-1"])("reports an actionable recovery path for invalid PID %j", async (value) => {
  const directory = await mkdtemp(join(tmpdir(), "aow-lock-invalid-"));
  try {
    await writeFile(join(directory, "host.pid"), value);
    await expect(lockHost(directory)).rejects.toThrow(/host.pid.*after confirming no terminal host is running/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("does not let a repeated release delete a later lock in the same process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-lock-release-"));
  try {
    const release = await lockHost(directory);
    await release();
    const next = await lockHost(directory);
    await release();
    await expect(lockHost(directory)).rejects.toThrow("already running");
    await next();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("preserves an interrupted update guard and explains manual recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aow-lock-guard-"));
  try {
    await mkdir(join(directory, "host.pid.guard"));
    await expect(lockHost(directory)).rejects.toThrow(/host.pid.guard.*after confirming no terminal host is running/u);
    expect((await stat(join(directory, "host.pid.guard"))).isDirectory()).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
