import { defineConfig } from "wxt";

const commands = {
  _execute_action: {
    suggested_key: {
      default: "Alt+Shift+O",
      mac: "MacCtrl+Shift+O",
    },
    description: "Show or hide Overcode",
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
    name: "Overcode",
    description: "Your coding agent, everywhere.",
    version: "0.1.0",
    ...(browser === "chrome" ? { minimum_chrome_version: "132" } : {}),
    icons: {
      16: "overcode-16.png",
      32: "overcode-32.png",
      48: "overcode-48.png",
      128: "overcode-128.png",
    },
    permissions: [
      "alarms",
      "cookies",
      "storage",
      "tabs",
      ...(manifestVersion === 2 ? ["http://*/*", "https://*/*"] : []),
    ],
    host_permissions: manifestVersion === 3 ? ["http://*/*", "https://*/*"] : undefined,
    commands,
    action: manifestVersion === 3
      ? {
          default_title: "Show / hide Overcode",
          default_icon: { 16: "overcode-16.png", 32: "overcode-32.png" },
        }
      : undefined,
    browser_action: manifestVersion === 2
      ? {
          default_title: "Show / hide Overcode",
          default_icon: { 16: "overcode-16.png", 32: "overcode-32.png" },
        }
      : undefined,
    background: browser === "safari" && manifestVersion === 2 ? { persistent: true } : undefined,
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
