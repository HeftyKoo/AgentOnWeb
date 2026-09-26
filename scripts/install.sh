#!/bin/sh
set -eu
# Publish this script at the installation URL with the corresponding npm release.
if [ "$(uname -s)" != Darwin ]; then
  echo 'One-command setup currently supports macOS + Chrome.' >&2
  exit 1
fi
if [ "$(id -u)" = 0 ]; then
  echo 'Run this installer as your own user, without sudo.' >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Install Node.js 22.19+ first, then run this installer again.' >&2
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<19)){console.error("Node.js 22.19+ is required.");process.exit(1)}'
# Setup is explicit here even when npm lifecycle scripts are disabled.
AOW_SKIP_SETUP=1 npm install --global --foreground-scripts '@agentonweb/terminal-host'
"$(npm prefix --global)/bin/aow" setup
