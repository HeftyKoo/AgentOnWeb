import { execFile } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = resolve(root, "apps/extension");
const variants = {
  chrome: "chrome-mv3",
  firefox: "firefox-mv2",
  safari: "safari-mv2",
};

export async function buildExtension({ browser = "chrome", outdir } = {}) {
  const variant = variants[browser];
  if (!variant) throw new Error(`Unsupported extension browser: ${browser}`);
  await execute("pnpm", ["--dir", app, "exec", "wxt", "build", "-b", browser], { cwd: root });
  const built = resolve(app, ".output", variant);
  if (!outdir) {
    if (browser === "chrome") {
      const compatibilityDirectory = resolve(app, "dist");
      await rm(compatibilityDirectory, { recursive: true, force: true });
      await cp(built, compatibilityDirectory, { recursive: true });
    }
    console.log(`Built ${browser} extension at ${built}`);
    return built;
  }
  await rm(outdir, { recursive: true, force: true });
  await cp(built, outdir, { recursive: true });
  console.log(`Built ${browser} extension at ${outdir}`);
  return outdir;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const browserIndex = process.argv.indexOf("--browser");
  const browser = browserIndex === -1 ? "chrome" : process.argv[browserIndex + 1];
  await buildExtension({ browser });
}
