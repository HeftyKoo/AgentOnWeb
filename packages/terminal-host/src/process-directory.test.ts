import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { expect, it } from "vitest";
import { processDirectory } from "./process-directory.js";

it.skipIf(!["darwin", "linux"].includes(process.platform))("reads the live directory after the process changes folders", async () => {
  const child = spawn(process.execPath, ["-e", 'process.stdout.write("ready"); process.stdin.once("data", () => { process.chdir(process.argv[1]); process.stdout.write("changed"); }); setInterval(() => {}, 1000);', tmpdir()], { cwd: process.cwd(), stdio: "pipe" });
  try {
    await once(child.stdout, "data");
    expect(await processDirectory(child.pid!)).toBe(await realpath(process.cwd()));
    const changed = once(child.stdout, "data");
    child.stdin.write("change\n");
    await changed;
    expect(await processDirectory(child.pid!)).toBe(await realpath(tmpdir()));
  } finally {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  expect(await processDirectory(child.pid!)).toBeUndefined();
});
