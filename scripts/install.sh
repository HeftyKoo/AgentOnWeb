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
  aow_original_path="$PATH"
  aow_node_bin="$(dirname "$(command -v node)")"
  export PATH="$aow_prefix/bin:$PATH"
  echo 'Installing AgentOnWeb terminal…'
  AOW_SKIP_SETUP=1 npm install --global --prefix "$aow_prefix" --foreground-scripts --prefer-online --no-audit --no-fund '@agentonweb/terminal-host@0.2.1' </dev/null

  # A child process cannot export PATH to its parent. Put a convenience link next
  # to Node when that directory is already on PATH and writable (e.g. nvm/Homebrew).
  # Never replace another program, and never link ~/.local/bin/aow to itself.
  aow_link_candidate="$aow_node_bin/aow"
  aow_can_link=false
  case "$aow_node_bin" in
    /*)
      case ":$aow_original_path:" in
        *":$aow_node_bin:"*)
          if [ ! "$aow_node_bin" -ef "$aow_prefix/bin" ] && [ -w "$aow_node_bin" ]; then
            if [ ! -e "$aow_link_candidate" ] && [ ! -L "$aow_link_candidate" ]; then
              aow_can_link=true
            elif [ -L "$aow_link_candidate" ]; then
              case "$(readlink "$aow_link_candidate")" in
                "$aow_prefix/bin/aow"|*/lib/node_modules/@agentonweb/terminal-host/lib/cli.js|*/lib/node_modules/@agentonweb/codex-surface/lib/cli.js) aow_can_link=true ;;
              esac
            fi
          fi
          ;;
      esac
      ;;
  esac
  if [ "$aow_can_link" = true ]; then
    if ! ln -sfn "$aow_prefix/bin/aow" "$aow_link_candidate"; then
      aow_can_link=false
      echo 'Could not add aow beside Node; use the full command path below.' >&2
    fi
  fi

  # Make the management command available in both login and interactive shells.
  # Terminal apps may select a shell different from the user's login SHELL.
  configure_aow_path() {
    aow_profile="$1"
    aow_path_line="$2"
    mkdir -p "$(dirname "$aow_profile")"
    if ! grep -Fqx "$aow_path_line" "$aow_profile" 2>/dev/null; then
      printf '\n# AgentOnWeb\n%s\n' "$aow_path_line" >> "$aow_profile"
    fi
  }
  aow_sh_path_line='case "$PATH" in "$HOME/.local/bin"|"$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac'
  aow_zdotdir="${ZDOTDIR:-$HOME}"
  configure_aow_path "$aow_zdotdir/.zprofile" "$aow_sh_path_line"
  configure_aow_path "$aow_zdotdir/.zshrc" "$aow_sh_path_line"
  # Bash reads only the first readable login profile. Do not shadow an existing one.
  aow_bash_profile="$HOME/.bash_profile"
  if [ ! -r "$aow_bash_profile" ]; then
    if [ -r "$HOME/.bash_login" ]; then
      aow_bash_profile="$HOME/.bash_login"
    elif [ -r "$HOME/.profile" ]; then
      aow_bash_profile="$HOME/.profile"
    fi
  fi
  configure_aow_path "$aow_bash_profile" "$aow_sh_path_line"
  configure_aow_path "$HOME/.bashrc" "$aow_sh_path_line"
  aow_has_fish=false
  case "${SHELL:-/bin/zsh}" in */fish) aow_has_fish=true ;; esac
  if command -v fish >/dev/null 2>&1; then aow_has_fish=true; fi
  if [ "$aow_has_fish" = true ]; then
    configure_aow_path "${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish" 'fish_add_path --path --move "$HOME/.local/bin"'
  fi
  # Keep the installed management command available even if connection setup fails.
  if ! "$aow_prefix/bin/aow" setup </dev/null; then
    echo 'AgentOnWeb is installed, but setup did not finish. Retry in this terminal:' >&2
    echo '  "$HOME/.local/bin/aow" setup' >&2
    return 1
  fi
  echo 'Ready. Open a website in Chrome, click AgentOnWeb, and run codex.'
  echo 'New zsh/bash terminal windows can run aow directly.'
  aow_current_command="$(PATH="$aow_original_path" command -v aow || true)"
  if [ "$aow_current_command" = "$aow_prefix/bin/aow" ] || { [ "$aow_can_link" = true ] && [ "$aow_current_command" = "$aow_link_candidate" ]; }; then
    echo 'This terminal can also run aow now, without sourcing a profile:'
    echo '  aow service'
  else
    echo 'To open the connection page from this already-open terminal, run:'
    echo '  "$HOME/.local/bin/aow" service'
    echo 'To also enable the short command in this terminal:'
    echo '  zsh/bash: export PATH="$HOME/.local/bin:$PATH"'
    if [ "$aow_has_fish" = true ]; then
      echo '  fish: fish_add_path --path --move "$HOME/.local/bin"'
    fi
  fi
}

install_agentonweb "$@"
