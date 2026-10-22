import { terminalUi } from './cli-ui.js';

type HelpSection = { title: string; rows: readonly (readonly [string, string])[] };
type Help = { usage: string; summary?: string; sections: HelpSection[] };
export const SETUP_USAGE = 'Usage: aow setup [--agents all|none|codex,claude,pi] [--extension-id CHROME_EXTENSION_ID]';
const topics: Record<string, Help> = {
  main: {
    usage: 'Usage: aow <command> [options]',
    summary: 'Your local terminal, connected to the web.',
    sections: [
      { title: 'CONNECT', rows: [
        ['setup', 'Configure the service and choose agent integrations.'],
        ['terminal', 'Run a foreground terminal host (also the default command).'],
        ['uninstall', 'Remove AgentOnWeb integrations and the local service.'],
      ] },
      { title: 'SERVICE', rows: [
        ['service [open]', 'Open the private browser connection page.'],
        ['service install', 'Start the service automatically at login.'],
        ['service status', 'Show the service, host version and active terminals.'],
        ['service restart [--force]', 'Restart the host; --force ends active tasks.'],
        ['service uninstall', 'Remove automatic startup and stop service terminals.'],
      ] },
      { title: 'AGENT INTEGRATIONS', rows: [
        ['codex-hooks install|uninstall', 'Manage Codex session hooks.'],
        ['claude-hooks install|uninstall', 'Manage Claude Code session hooks.'],
        ['pi-extension install|uninstall', 'Manage the Pi extension (Pi 1.1+).'],
      ] },
      { title: 'MAINTENANCE', rows: [
        ['check-update', 'Check for a newer stable npm version.'],
        ['check-update --enable|--disable', 'Enable or disable automatic update checks.'],
        ['update [--force]', 'Upgrade the CLI and restart the macOS service.'],
        ['--version', 'Print the installed version.'],
        ['-h, --help, help', 'Show this help.'],
      ] },
      { title: 'QUICK START', rows: [
        ['aow setup', 'Choose integrations with a checkbox menu.'],
        ['aow terminal', 'Run the terminal host in the foreground.'],
        ['aow setup --agents codex,pi', 'Select integrations without prompting.'],
        ['aow service status', 'Check the running service.'],
      ] },
    ],
  },
  setup: {
    usage: SETUP_USAGE,
    summary: 'Detect CLIs on PATH, then ask which integrations to install with a checkbox menu.',
    sections: [
      { title: 'KEYS', rows: [
        ['Up / Down', 'Move between detected agents.'], ['Space', 'Toggle the focused checkbox.'],
        ['A / I', 'Select or clear all / invert selection.'], ['Enter', 'Confirm; clear all for the terminal service only.'],
        ['Ctrl+C / Esc', 'Cancel before installing integrations or configuring the service.'],
      ] },
      { title: 'OPTIONS', rows: [
        ['--agents codex,claude,pi', 'Select a comma-separated subset without prompting.'],
        ['--agents all', 'Select every detected CLI without prompting.'],
        ['--agents none', 'Configure the terminal service only.'],
        ['--extension-id ID', 'Also allow this Chrome extension ID; may be repeated.'],
      ] },
      { title: 'NOTES', rows: [
        ['Detection', 'Missing CLIs are always skipped. Selection does not remove existing integrations.'],
        ['Terminal', 'Works with curl | bash through /dev/tty. Use --agents when no interactive terminal is available.'],
      ] },
    ],
  },
  service: {
    usage: 'Usage: aow service <action> [options]',
    summary: 'Manage the macOS login service (default: open).',
    sections: [{ title: 'ACTIONS', rows: [
      ['open', 'Open the private browser connection page.'],
      ['install [--no-open]', 'Install automatic startup; optionally skip opening the browser.'],
      ['status', 'Show the loaded service, installed/running versions and terminals.'],
      ['restart [--force]', 'Restart after closing terminals; --force ends their tasks.'],
      ['uninstall', 'Remove automatic startup and stop service terminals.'],
    ] }],
  },
  'check-update': {
    usage: 'Usage: aow check-update [--enable|--disable]',
    summary: 'Check the stable npm version. Explicit checks still work when automatic checks are disabled.',
    sections: [{ title: 'OPTIONS', rows: [
      ['--enable', 'Enable automatic update checks.'], ['--disable', 'Disable automatic update checks.'],
    ] }],
  },
  update: {
    usage: 'Usage: aow update [--force]',
    summary: 'Install the newer stable npm version into the existing prefix and restart the macOS service. Close terminals first.',
    sections: [{ title: 'OPTIONS', rows: [['--force', 'Reinstall even at the current stable version; end active terminal tasks when restarting.']] }],
  },
  terminal: {
    usage: 'Usage: aow terminal', summary: 'Run the terminal host in the foreground. Keep this process running while using your browser terminal.',
    sections: [{ title: 'SERVICE', rows: [['aow setup', 'Configure automatic startup on macOS + Chrome.']] }],
  },
  uninstall: {
    usage: 'Usage: aow uninstall', summary: 'Remove hooks, notification forwarding, the native bridge and the local service.',
    sections: [{ title: 'RETAINED DATA', rows: [['Local data', 'Backups, browser grants, pairing receipts and CLI history are retained.']] }],
  },
};
for (const [command, label] of [['codex-hooks', 'Codex hooks'], ['claude-hooks', 'Claude Code hooks'], ['pi-extension', 'Pi extension']] as const) {
  topics[command] = {
    usage: `Usage: aow ${command} install|uninstall`,
    sections: [{ title: label.toUpperCase(), rows: [
      ['install', `Install AgentOnWeb ${label}; preserve existing settings.`],
      ['uninstall', `Remove AgentOnWeb ${label}; preserve other settings.`],
    ] }],
  };
}

export function hasHelp(topic: string) { return Object.hasOwn(topics, topic); }

export function formatHelp(topic = 'main', ui = terminalUi()) {
  const help = topics[topic]!;
  return [ui.banner(topic === 'main' ? 'COMMAND INTERFACE' : topic.toUpperCase()), '',
    ui.wrap(help.usage), ...(help.summary ? ['', ui.wrap(help.summary)] : []),
    ...help.sections.flatMap(section => ['', ui.section(section.title), ui.rows(section.rows)]),
    ...(topic === 'main' ? ['', ui.wrap('Run aow <command> --help for options and keyboard controls.')] : []),
  ].join('\n');
}
