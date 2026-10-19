---
layout: default
title: AgentOnWeb Support
---
# AgentOnWeb Support

## Ask a question or request help

**[Contact the developer through GitHub Issues](https://github.com/HeftyKoo/AgentOnWeb/issues/new)**

Use this support channel for installation questions, bug reports, and feature requests. The developer replies in the issue thread. A free GitHub account is required to send a request. [Read existing questions and replies](https://github.com/HeftyKoo/AgentOnWeb/issues) without an account.

Please include:

- Your operating system, browser, AgentOnWeb version, and whether you are using Local terminal or DSH.
- The steps you followed and the result you expected.
- The error message, if one appears.

Do not include API keys, tokens, private code, or personal information.

## Start without a local runtime

In build 5 or later, open the AgentOnWeb macOS app and click **Try Interactive Demo**. This opens a populated, interactive offline demo without DSH, an account, a model subscription, or an API key. The Safari toolbar menu provides the same demo. Sample conversations and tool results are clearly labeled; the presentation controls and scratchpad are interactive.

## Toolbar looks grey or the page does not open

Enable AgentOnWeb in Safari Settings → Extensions. Open an ordinary HTTP or HTTPS website and allow access for that website. Reload a page that was already open before enabling the extension. Safari internal pages, the Start Page, and protected pages cannot display an injected workspace.

In build 5 or later, the toolbar opens a menu with **Try interactive demo**, **Show / hide on this website**, and **Allow local workspace access**. The containing app also has the demo button, independent of Safari permissions.

## Connect a live workspace

For DSH, live agent features require DeepSeek Harness running on the same Mac with the AgentOnWeb plugin. Follow the [complete setup guide](index.html#setup). Provider credentials are configured in DSH, not in the extension. Provider usage may incur charges.

If no runtime is found, check that `dsh web` is running and restart it after installing the plugin. Allow access to localhost and 127.0.0.1 from the toolbar menu. Approve the connection in DSH. Follow the local-session prompts when returning to your website.

[Setup guide](index.html) · [Privacy policy](privacy.html) · [Source and releases](https://github.com/HeftyKoo/AgentOnWeb)

## Local terminal

Use Codex or Claude Code on your websites with macOS + Chrome. Install the Chrome store extension and follow the [one-command setup guide](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/one-command-setup.md). The installer configures the terminal service and Chrome connection, detects installed CLIs on `PATH`, and asks which Codex/Claude Code/Pi notification integrations to install.

If Local terminal is missing, check `aow service status` or keep `aow terminal` running. Use `aow service open` to reopen private pairing/connection management. Type `cd` and your CLI commands inside the browser shell. All connected views can type into the same shell; focus its view to control terminal dimensions. If the shell exited, use **+** to create another one. Refreshing a view preserves a running shell; a host or computer restart ends live shell processes.

Terminal host 0.4.1 checks the stable npm version daily without installing code or interrupting tasks. Its private management page shows available updates and installed versus running versions. Use `aow check-update` to check now or `aow check-update --disable` to turn automatic checks off. Run `aow update` or `aow service restart` in a separate macOS Terminal after exiting or closing all live shells. Explicit `--force` ends their tasks. For the first upgrade from 0.4.0 or earlier, finish terminal work, run `aow service uninstall`, then rerun the installer. Saved history, browser grants and integration settings remain. Never include the private setup URL or raw service logs in public issues.

## Setup, notifications and removal

On macOS + Chrome, `aow setup` configures the service and native pairing, and shows a checkbox menu for the Codex/Claude Code/Pi integrations detected on `PATH`. Use Up/Down to move, Space to toggle, A to select/clear all, I to invert, and Enter to confirm. Clear all to skip integrations. For unattended setup use `--agents codex,claude`, `--agents all` or `--agents none`; missing CLIs are always skipped. Review AgentOnWeb hooks in your CLI's `/hooks`, then launch a new Codex or Claude Code session in a new host terminal for session notifications. If an older host is running, finish terminal work, run `aow service uninstall`, then `aow setup`. Before removing the npm package run `aow uninstall`. See [setup, upgrade and uninstall](https://github.com/HeftyKoo/AgentOnWeb/blob/main/docs/one-command-setup.md).
