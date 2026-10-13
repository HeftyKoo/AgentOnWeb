import { mkdir, readFile, writeFile, rename, copyFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const marker = "// AgentOnWeb session status\n";
const directory = () => {
  const path = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
};

async function update(configDirectory: string, install: boolean): Promise<string> {
  const path = join(configDirectory, "extensions", "agentonweb.ts");
  let source: string | undefined;
  try { source = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (source !== undefined && !source.startsWith(marker)) throw new Error(`Refusing to overwrite an unrelated Pi extension: ${path}`);
  if (!install) {
    if (source !== undefined) await unlink(path);
    return path;
  }
  const entry = fileURLToPath(new URL("./pi-extension.js", import.meta.url));
  const updated = `${marker}export { default } from ${JSON.stringify(entry)};\n`;
  if (source === updated) return path;
  await mkdir(dirname(path), { recursive: true });
  if (source !== undefined) await copyFile(path, `${path}.agentonweb-${Date.now()}.bak`);
  const temp = `${path}.agentonweb.tmp`;
  await writeFile(temp, updated, { mode: 0o600 });
  await rename(temp, path);
  return path;
}

export async function installPiExtension(configDirectory = directory()): Promise<string> {
  return update(configDirectory, true);
}

export async function uninstallPiExtension(configDirectory = directory()): Promise<void> {
  await update(configDirectory, false);
}
