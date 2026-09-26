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

For the released DSH edition, live agent features require DeepSeek Harness running on the same Mac with the AgentOnWeb plugin. Follow the [complete setup guide](index.html#setup). Provider credentials are configured in DSH, not in the extension. Provider usage may incur charges.

If no runtime is found, check that `dsh web` is running and restart it after installing the plugin. Allow access to localhost and 127.0.0.1 from the toolbar menu. Approve the connection in DSH. Follow the local-session prompts when returning to your website.

[Setup guide](index.html) · [Privacy policy](privacy.html) · [Source and releases](https://github.com/HeftyKoo/AgentOnWeb)

## Local terminal from source

The source checkout also provides a real local shell. It needs the source-built extension and separately installed host archive, not just the published DSH extension. Follow the [local terminal guide](https://github.com/HeftyKoo/AgentOnWeb/blob/main/packages/terminal-host/README.md). Live acceptance currently covers macOS/Chrome; other platforms and live Firefox/Safari still need terminal acceptance testing.

If Local terminal is missing, check `aow service status` or keep `aow terminal` running. Use `aow service open` to reopen private pairing/connection management. Type `cd` and your CLI commands inside the browser shell. If the terminal is read-only, use **Control here**. If the shell exited, use **+** to create another one. Refreshing a view preserves a running shell; a host or computer restart ends live shell processes.

Reinstalling a running service does not load new host code immediately. Finish your terminal work before stopping and reinstalling the service. Never include the private setup URL or raw service logs in public issues.
