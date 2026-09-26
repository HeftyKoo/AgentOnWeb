import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "wxt";

// The release contract is the version authority; the generated manifests must
// agree with it (see scripts/release-audit.mjs and docs/releasing.md). The
// extension version is independent from the npm plugin version.
const releaseContract = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../release-contract.json"), "utf8")) as { extensionVersion: string };

const commands = {
  _execute_action: {
    suggested_key: {
      default: "Alt+Shift+O",
      mac: "MacCtrl+Shift+O",
    },
    description: "Show or hide AgentOnWeb",
  },
  "mode-chill": {
    suggested_key: {
      default: "Alt+Shift+1",
      mac: "MacCtrl+Shift+1",
    },
    description: "Switch to Chill mode",
  },
  "mode-focus": {
    suggested_key: {
      default: "Alt+Shift+2",
      mac: "MacCtrl+Shift+2",
    },
    description: "Switch to Focus mode",
  },
  "mode-watch": {
    suggested_key: {
      default: "Alt+Shift+3",
      mac: "MacCtrl+Shift+3",
    },
    description: "Switch to Watch mode",
  },
} as const;

export default defineConfig({
  targetBrowsers: ["chrome", "firefox", "safari"],
  publicDir: "icons",
  manifest: ({ browser, manifestVersion }) => ({
    name: "AgentOnWeb",
    description: "Agent On Web. Bring your native coding agent onto any website. This edition: DSH On Web.",
    version: releaseContract.extensionVersion,
    ...(browser === "chrome" ? { minimum_chrome_version: "132" } : {}),
    icons: {
      16: "agentonweb-16.png",
      32: "agentonweb-32.png",
      48: "agentonweb-48.png",
      128: "agentonweb-128.png",
    },
    permissions: [
      "alarms",
      "cookies",
      "storage",
      "tabs",
      ...(manifestVersion === 2 ? ["http://*/*", "https://*/*"] : []),
      ...(browser !== "firefox" ? ["declarativeNetRequestWithHostAccess"] : []),
    ],
    host_permissions: manifestVersion === 3 ? ["http://*/*", "https://*/*"] : undefined,
    commands,
    action: manifestVersion === 3
      ? {
          default_title: "Show / hide AgentOnWeb",
          default_icon: { 16: "agentonweb-16.png", 32: "agentonweb-32.png" },
        }
      : undefined,
    browser_action: manifestVersion === 2
      ? {
          default_title: "Show / hide AgentOnWeb",
          default_icon: { 16: "agentonweb-16.png", 32: "agentonweb-32.png" },
        }
      : undefined,
    background: browser === "safari" && manifestVersion === 2 ? { persistent: true } : undefined,
    web_accessible_resources: manifestVersion === 3
      ? [{ resources: ["native-surface.html"], matches: ["http://*/*", "https://*/*"] }]
      : ["native-surface.html"],
    browser_specific_settings: browser === "firefox"
      ? {
          gecko: {
            data_collection_permissions: { required: ["none"] },
          },
        }
      : browser === "safari"
        ? { safari: { strict_min_version: "18.4" } }
        : undefined,
  }),
});
