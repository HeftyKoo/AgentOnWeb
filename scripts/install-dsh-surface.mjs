import { spawn } from "node:child_process";
import { resolve } from "node:path";
import "./build-dsh-plugin.mjs";

const packagePath = resolve(import.meta.dirname, "../packages/dsh-surface-plugin");
const child = spawn("dsh", ["plugin", "--profile", "web", "add", packagePath], {
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(`Could not install the Overcode DeepSeek Harness client plugin: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (code !== 0) {
    console.error(`dsh plugin exited with ${String(code ?? signal)}.`);
    process.exitCode = code ?? 1;
  }
});
