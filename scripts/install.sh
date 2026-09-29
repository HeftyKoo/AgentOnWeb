#!/bin/sh
set -eu

# Keep all work inside the function so a truncated curl stream cannot start setup.
install_agentonweb() {
  if [ "$(uname -s)" != Darwin ]; then
    echo 'AgentOnWeb setup supports macOS + Chrome.' >&2
    return 1
  fi
  if [ "$(id -u)" = 0 ]; then
    echo 'Run this installer as your own user, without sudo.' >&2
    return 1
  fi
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo 'Install Node.js 22.19+ from https://nodejs.org/en/download, then run this command again.' >&2
    return 1
  fi
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<19)){console.error("Node.js 22.19+ is required.");process.exit(1)}' </dev/null

  # A user-owned prefix avoids sudo and leaves npm's global configuration alone.
  aow_prefix="$HOME/.local"
  export PATH="$aow_prefix/bin:$PATH"
  echo 'Installing AgentOnWeb terminal…'
  AOW_SKIP_SETUP=1 npm install --global --prefix "$aow_prefix" --foreground-scripts --no-audit --no-fund '@agentonweb/terminal-host@0.2.0' </dev/null
  "$aow_prefix/bin/aow" setup </dev/null

  # Make the management command available in the user's next login shell.
  case "${SHELL:-/bin/zsh}" in
    */bash) aow_profile="$HOME/.bash_profile" ;;
    *) aow_profile="$HOME/.zprofile" ;;
  esac
  aow_path_line='export PATH="$HOME/.local/bin:$PATH"'
  if ! grep -Fqx "$aow_path_line" "$aow_profile" 2>/dev/null; then
    printf '\n# AgentOnWeb\n%s\n' "$aow_path_line" >> "$aow_profile"
  fi
  echo 'Ready. Open a website in Chrome, click AgentOnWeb, and run codex.'
}

install_agentonweb "$@"
