import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "apps/extension/.output");
const variants = {
  chrome: { directory: "chrome-mv3", manifestVersion: 3 },
  firefox: { directory: "firefox-mv2", manifestVersion: 2 },
  safari: { directory: "safari-mv2", manifestVersion: 2 },
};

for (const [browser, expected] of Object.entries(variants)) {
  const manifest = JSON.parse(await readFile(resolve(output, expected.directory, "manifest.json"), "utf8"));
  const backgroundSource = await readFile(resolve(output, expected.directory, "background.js"), "utf8");
  const contentSource = await readFile(resolve(output, expected.directory, "content-scripts/agentonweb.js"), "utf8");
  if (manifest.manifest_version !== expected.manifestVersion) throw new Error(`${browser} manifest version is incorrect.`);
  const background = expected.manifestVersion === 3 ? manifest.background?.service_worker : manifest.background?.scripts?.[0];
  if (background !== "background.js") throw new Error(`${browser} background entry is incorrect.`);
  if (manifest.content_scripts?.[0]?.js?.[0] !== "content-scripts/agentonweb.js") throw new Error(`${browser} content entry is incorrect.`);
  if (!manifest.commands?.["mode-chill"] || !manifest.commands?.["mode-focus"] || !manifest.commands?.["mode-watch"]) {
    throw new Error(`${browser} mode commands are incomplete.`);
  }
  if (browser === "safari" && !manifest.commands?._execute_action?.description) {
    throw new Error("Safari toolbar command description is missing.");
  }
  for (const size of [16, 32, 48, 128]) {
    if (manifest.icons?.[size] !== `agentonweb-${size}.png`) throw new Error(`${browser} icon ${size} is missing.`);
  }
  const surfaceHtml = await readFile(resolve(output, expected.directory, "native-surface.html"), "utf8");
  if (!surfaceHtml.includes("<script")) throw new Error(`${browser} native workspace document is missing its entry.`);
  const resources = manifest.web_accessible_resources ?? [];
  if (!(expected.manifestVersion === 3 ? resources.some((entry) => entry.resources?.includes("native-surface.html"))
    : resources.includes("native-surface.html"))) throw new Error(`${browser} native workspace document is inaccessible.`);
  if (!contentSource.includes("/native-surface.html")) throw new Error(`${browser} does not use the shared workspace document.`);
  const permissions = new Set(manifest.permissions ?? []);
  for (const permission of ["alarms", "cookies", "storage", "tabs"]) {
    if (!permissions.has(permission)) throw new Error(`${browser} permission ${permission} is missing.`);
  }
  if (browser === "firefox" && manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required?.[0] !== "none") {
    throw new Error("Firefox data-collection declaration is missing.");
  }
  if (browser === "safari") {
    if (!permissions.has("declarativeNetRequestWithHostAccess")) throw new Error("Safari declarative header-lease permission is missing.");
    if (permissions.has("webRequestBlocking")) throw new Error("Safari included its unsupported webRequestBlocking permission.");
    if (manifest.browser_specific_settings?.safari?.strict_min_version !== "18.4") throw new Error("Safari minimum version is incorrect.");
    if (!backgroundSource.includes("updateSessionRules") || !backgroundSource.includes("tabIds")) {
      throw new Error("Safari declarative header lease was not bundled.");
    }
  } else if (backgroundSource.includes("updateSessionRules")) {
    throw new Error(`${browser} unexpectedly bundled the Safari header lease.`);
  }
  if (!contentSource.includes("agentonweb-extension-root")) throw new Error(`${browser} content surface was not bundled.`);
}

console.log("WXT browser manifests passed: Chrome MV3, Firefox MV2, Safari MV2.");
