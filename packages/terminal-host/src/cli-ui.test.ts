import { stripVTControlCharacters } from 'node:util';
import { expect, it } from 'vitest';
import { terminalUi } from './cli-ui.js';
import { formatHelp } from './cli-help.js';

const output = (columns: number, isTTY = true) => ({ write: () => true, columns, isTTY });

it.each([24, 40, 60, 80, 120])('keeps every help line within a %s-column terminal', columns => {
  const ui = terminalUi(output(columns), { TERM: 'xterm-256color' });
  for (const topic of ['main', 'setup', 'service', 'update', 'check-update', 'codex-hooks', 'claude-hooks', 'pi-extension']) {
    const help = stripVTControlCharacters(formatHelp(topic, ui));
    for (const line of help.split('\n')) expect(line.length, `${topic}: ${line}`).toBeLessThan(columns);
  }
});

it('groups commands with descriptions and examples', () => {
  const help = formatHelp('main', terminalUi(output(80), {}));
  for (const title of ['CONNECT', 'SERVICE', 'AGENT INTEGRATIONS', 'MAINTENANCE', 'QUICK START']) expect(help).toContain(`[ ${title} ]`);
  expect(help).toContain('aow setup --agents codex,pi');
  expect(help).toContain('aow terminal');
  expect(help).toContain('aow <command> --help');
});

it('uses ANSI green on terminals and plain text for pipes, NO_COLOR and TERM=dumb', () => {
  expect(terminalUi(output(80), {}).banner()).toContain('\x1b[1;92m');
  for (const [isTTY, env] of [[false, {}], [true, { NO_COLOR: '' }], [true, { NO_COLOR: '1', FORCE_COLOR: '1' }], [true, { TERM: 'dumb' }], [true, { FORCE_COLOR: '0' }]] as const) {
    const help = formatHelp('main', terminalUi(output(80, isTTY), env));
    expect(help).not.toContain('\x1b');
  }
});
