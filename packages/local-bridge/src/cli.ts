#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PairingAuthority } from "./credentials.js";
import { HarnessWebSupervisor } from "./harness-surface.js";
import { startBridge } from "./server.js";

interface CliOptions {
  readonly port: number;
  readonly configDirectory: string;
  readonly resetPairing: boolean;
  readonly dshCommand: string;
  readonly dshPatch: string;
  readonly dshCwd?: string;
}

const options = parseArgs(process.argv.slice(2));
const authority = await PairingAuthority.open(options.configDirectory, options.resetPairing);
const surface = new HarnessWebSupervisor({
  command: options.dshCommand,
  args: ["web", "--patch", options.dshPatch, "--no-open", "--port", "0"],
  ...(options.dshCwd ? { cwd: options.dshCwd } : {}),
  onStderr(text) {
    process.stderr.write(`[dsh] ${text}`);
  },
});

try {
  const ready = await surface.getSurface();
  process.stderr.write(`DeepSeek Harness native Web surface ready at ${ready.url}\n`);
} catch (error) {
  process.stderr.write(`DeepSeek Harness Web UI is not ready: ${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write("The bridge will stay available; install the Overcode surface plugin and reconnect.\n");
}

const bridge = await startBridge({
  surface,
  authority,
  port: options.port,
});

process.stderr.write(`Overcode bridge listening on ws://${bridge.host}:${bridge.port}\n`);
if (authority.pairingCode) {
  process.stderr.write(`Pairing code: ${authority.pairingCode.slice(0, 4)} ${authority.pairingCode.slice(4)} (expires in 10 minutes)\n`);
} else {
  process.stderr.write(`Paired extension: ${authority.configuredOrigin ?? "configured"}\n`);
}

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await bridge.close();
  await surface.close();
};

process.on("SIGINT", () => { void close().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { void close().finally(() => process.exit(0)); });

function parseArgs(args: readonly string[]): CliOptions {
  let port = 3847;
  let configDirectory = defaultConfigDirectory();
  let resetPairing = false;
  let dshCommand = "dsh";
  let dshPatch = defaultSurfacePatch();
  let dshCwd: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    if (argument === "--reset-pairing") {
      resetPairing = true;
      continue;
    }
    const value = args[index + 1];
    if (!value) throw new Error(`Missing value for ${argument ?? "argument"}.`);
    if (argument === "--port") port = Number.parseInt(value, 10);
    else if (argument === "--config-dir") configDirectory = value;
    else if (argument === "--dsh-command") dshCommand = value;
    else if (argument === "--dsh-patch") dshPatch = value;
    else if (argument === "--dsh-cwd") dshCwd = value;
    else throw new Error(`Unknown argument: ${argument}`);
    index += 1;
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be between 1 and 65535.");
  return {
    port,
    configDirectory,
    resetPairing,
    dshCommand,
    dshPatch,
    ...(dshCwd ? { dshCwd } : {}),
  };
}

function defaultSurfacePatch(): string {
  return fileURLToPath(new URL("../../dsh-surface-plugin/cordis.patch.yml", import.meta.url));
}

function defaultConfigDirectory(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "overcode") : join(homedir(), ".config", "overcode");
}

function helpText(): string {
  return `Overcode local bridge\n\nUsage: overcode-bridge [options]\n\n  --port <number>       Loopback WebSocket port (default 3847)\n  --config-dir <path>   Pairing credential directory\n  --reset-pairing       Revoke the paired extension and issue a new code\n  --dsh-command <path>  Pinned DeepSeek Harness executable (default dsh)\n  --dsh-patch <path>    Overcode DSH client-plugin patch\n  --dsh-cwd <path>      Initial Harness workspace directory\n  --help                Show this help\n`;
}
