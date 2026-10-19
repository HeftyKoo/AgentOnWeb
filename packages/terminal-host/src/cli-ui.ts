import type { Writable } from 'node:stream';
import { VERSION } from './version.js';

type TerminalOutput = Pick<Writable, 'write'> & { isTTY?: boolean; columns?: number };
type Tone = 'green' | 'muted' | 'warning' | 'error';
type Status = 'ok' | 'info' | 'skip' | 'warn';
const colors = { green: '1;92', muted: '32', warning: '33', error: '31' };

/** Styling belongs at the human output boundary; protocol/version output stays raw. */
export function terminalUi(output: TerminalOutput = process.stdout, env = process.env) {
  const color = env.NO_COLOR === undefined && env.TERM !== 'dumb'
    && (env.FORCE_COLOR !== undefined ? env.FORCE_COLOR !== '0' : Boolean(output.isTTY));
  const width = Math.max(1, Math.min(output.columns || 80, 100) - 1);
  const paint = (text: string, tone: Tone = 'green') => color ? `\x1b[${colors[tone]}m${text}\x1b[0m` : text;
  const wrap = (text: string, indent = ''): string => {
    const prefix = indent.slice(0, Math.max(0, width - 1));
    const size = Math.max(1, width - prefix.length);
    return text.split('\n').flatMap(line => {
      const lines: string[] = [];
      let rest = line;
      while (rest.length > size) {
        const space = rest.lastIndexOf(' ', size);
        const end = space > 0 ? space : size;
        lines.push(prefix + rest.slice(0, end));
        rest = rest.slice(end).trimStart();
      }
      lines.push(prefix + rest);
      return lines;
    }).join('\n');
  };
  return {
    width, paint, wrap,
    banner: (context?: string) => [
      paint(wrap(`AOW // AGENTONWEB   v${VERSION}`)),
      ...(context ? [paint(wrap(context), 'muted')] : []),
      paint('-'.repeat(Math.min(width, 62)), 'muted'),
    ].join('\n'),
    section: (title: string) => paint(wrap(`[ ${title} ]`)),
    rows: (rows: readonly (readonly [string, string])[]) => {
      const column = Math.max(...rows.map(([command]) => command.length)) + 2;
      return rows.map(([command, description]) => {
        if (width < 78 || column > width / 2) {
          return paint(wrap(command, '  ')) + '\n' + wrap(description, '    ');
        }
        const descriptionLines = wrap(description, ' '.repeat(column + 2)).split('\n');
        descriptionLines[0] = '  ' + paint(command.padEnd(column)) + descriptionLines[0]!.slice(column + 2);
        return descriptionLines.join('\n');
      }).join('\n');
    },
    status: (kind: Status, text: string) => {
      const tag = `[${kind}]`;
      const lines = wrap(text, ' '.repeat(tag.length + 1)).split('\n');
      lines[0] = paint(tag, kind === 'warn' ? 'warning' : kind === 'skip' ? 'muted' : 'green')
        + ' ' + lines[0]!.slice(tag.length + 1);
      return lines.join('\n');
    },
  };
}

export function printStatus(kind: Status, text: string) {
  console.log(terminalUi().status(kind, text));
}

export function printError(error: unknown) {
  const ui = terminalUi(process.stderr);
  console.error(ui.paint('aow:', 'error') + ' ' + (error instanceof Error ? error.message : String(error)));
}
