import { spawn, type ChildProcess } from "node:child_process";
import type { HarnessSurface } from "@overcode/shared-protocol";

const READY_PATTERN = /dsh web: (http:\/\/[^\s]+\/\?token=[A-Za-z0-9_-]+)/u;
const SET_COOKIE_PATTERN = /^([^=;]+)=([^;]+)(?:;.*?Max-Age=(\d+))?/iu;
const START_TIMEOUT_MS = 90_000;

export interface HarnessSurfaceProvider {
  getSurface(): Promise<HarnessSurface>;
}

export interface HarnessWebSupervisorOptions {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly onStderr?: (text: string) => void;
}

export class HarnessWebSupervisor implements HarnessSurfaceProvider {
  readonly #options: HarnessWebSupervisorOptions;
  #child: ChildProcess | undefined;
  #surface: Promise<HarnessSurface> | undefined;

  constructor(options: HarnessWebSupervisorOptions = {}) {
    this.#options = options;
  }

  getSurface(): Promise<HarnessSurface> {
    return this.#surface ??= this.#start();
  }

  async close(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#surface = undefined;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 3_000).unref();
    });
  }

  async #start(): Promise<HarnessSurface> {
    const args = this.#options.args ?? ["web", "--no-open", "--port", "0"];
    const child = spawn(this.#options.command ?? "dsh", args, {
      ...(this.#options.cwd ? { cwd: this.#options.cwd } : {}),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.#child = child;

    return await new Promise<HarnessSurface>((resolve, reject) => {
      let output = "";
      let settled = false;
      const timeout = setTimeout(() => fail(new Error("DeepSeek Harness Web UI did not become ready in time.")), START_TIMEOUT_MS);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.#surface = undefined;
        reject(error);
      };
      const inspect = (text: string) => {
        output = (output + text).slice(-16_384);
        const match = READY_PATTERN.exec(output);
        if (!match?.[1] || settled) return;
        settled = true;
        clearTimeout(timeout);
        void exchangeLaunchToken(match[1]).then(resolve, reject);
      };
      child.stdout?.on("data", (chunk: Buffer) => inspect(chunk.toString("utf8")));
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        this.#options.onStderr?.(text);
        inspect(text);
      });
      child.once("error", (error) => fail(error));
      child.once("exit", (code, signal) => {
        if (!settled) fail(new Error(`DeepSeek Harness Web UI exited before readiness (${String(code ?? signal)}).`));
      });
    });
  }
}

async function exchangeLaunchToken(printedUrl: string): Promise<HarnessSurface> {
  const launchUrl = new URL(printedUrl);
  launchUrl.hostname = "localhost";
  const response = await fetch(launchUrl, { redirect: "manual" });
  if (response.status !== 303) {
    throw new Error(`DeepSeek Harness browser authentication returned HTTP ${String(response.status)}.`);
  }
  const setCookie = response.headers.get("set-cookie");
  const match = setCookie ? SET_COOKIE_PATTERN.exec(setCookie) : null;
  if (!match?.[1] || !match[2]) throw new Error("DeepSeek Harness did not issue its browser session cookie.");
  return {
    runtimeId: "deepseek-harness",
    displayName: "DeepSeek Harness",
    url: `${launchUrl.origin}/`,
    cookie: {
      name: match[1],
      value: match[2],
      maxAgeSeconds: Number.parseInt(match[3] ?? "2592000", 10),
    },
  };
}
