import { closeSync, openSync } from 'node:fs';
import { emitKeypressEvents, type Key } from 'node:readline';
import { ReadStream, WriteStream } from 'node:tty';
import { stripVTControlCharacters } from 'node:util';
import type { SetupAgent } from './setup-agents.js';
import { terminalUi } from './cli-ui.js';

const names = { codex: 'Codex hooks', claude: 'Claude Code hooks', pi: 'Pi extension' };
const terminalRequired = 'Interactive setup needs a terminal with keyboard controls. Run aow setup in a terminal, or pass --agents all, --agents codex,claude,pi, or --agents none for unattended setup.';
const cancellation = 'Setup cancelled before installing integrations or configuring the service.';

/** Use the controlling TTY, including when the installer's stdin is a curl pipe. */
export async function readAgentSelection(available: readonly SetupAgent[], input: ReadStream, output: WriteStream): Promise<SetupAgent[]> {
  if (!available.length) return [];
  if (!input.isTTY || !output.isTTY || !input.setRawMode || process.env.TERM === 'dumb') throw new Error(terminalRequired);
  const wasRaw = input.isRaw;
  const wasPaused = input.readableFlowing !== true;
  const selected = new Set(available);
  let focused = 0;
  let rendered = '';
  let settled = false;
  const render = (done = false) => {
    const ui = terminalUi(output);
    const text = done ? ui.status('ok', `Selected: ${available.filter(agent => selected.has(agent)).map(agent => names[agent]).join(', ') || 'terminal service only'}.`) : [
      ui.section('AGENT INTEGRATIONS'),
      ui.wrap('Choose integrations to install. All detected agents start selected.'), '',
      ...available.map((agent, index) => ui.paint(ui.wrap(`${focused === index ? '>' : ' '} [${selected.has(agent) ? 'x' : ' '}] ${names[agent]}`), focused === index || selected.has(agent) ? 'green' : 'muted')),
      '', ui.paint(ui.wrap(`${selected.size}/${available.length} selected. Clear all for service only.`), 'muted'),
      ui.wrap('Up/Down move  Space toggle  A all/none  I invert'),
      ui.wrap('Enter confirm  Ctrl+C / Esc cancel'),
    ].join('\n');
    if (rendered) {
      const columns = output.columns || 80;
      const lines = stripVTControlCharacters(rendered).split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / columns)), 0);
      output.write(`\x1b[${lines}A\r\x1b[J`);
    }
    output.write(text + '\n');
    rendered = text;
  };
  const resize = () => render();
  let onKey: ((text: string, key: Key) => void) | undefined;
  let onCancel: (() => void) | undefined;
  let onError: ((error: Error) => void) | undefined;
  try {
    input.setRawMode(true);
    emitKeypressEvents(input);
    return await new Promise<SetupAgent[]>((resolve, reject) => {
      onCancel = () => { settled = true; reject(new Error(cancellation)); };
      onError = error => { settled = true; reject(error); };
      onKey = (_text, key) => {
        if (settled) return;
        if (key.name === 'escape' || key.ctrl && ['c', 'd'].includes(key.name ?? '')) { onCancel!(); return; }
        if (key.name === 'return' || key.name === 'enter') {
          settled = true; render(true); resolve(available.filter(agent => selected.has(agent))); return;
        }
        if (key.name === 'up' || key.name === 'k') focused = (focused + available.length - 1) % available.length;
        else if (key.name === 'down' || key.name === 'j') focused = (focused + 1) % available.length;
        else if (key.name === 'space') {
          const agent = available[focused]!;
          if (selected.has(agent)) selected.delete(agent); else selected.add(agent);
        } else if (key.name === 'a') {
          if (selected.size === available.length) selected.clear(); else available.forEach(agent => selected.add(agent));
        } else if (key.name === 'i') {
          available.forEach(agent => { if (selected.has(agent)) selected.delete(agent); else selected.add(agent); });
        } else return;
        render();
      };
      input.on('keypress', onKey);
      input.once('end', onCancel);
      input.once('close', onCancel);
      input.once('error', onError);
      output.once('error', onError);
      process.once('SIGINT', onCancel);
      process.once('SIGTERM', onCancel);
      output.on('resize', resize);
      input.resume();
      output.write('\x1b[?25l');
      render();
    });
  } finally {
    if (onKey) input.removeListener('keypress', onKey);
    if (onCancel) {
      input.removeListener('end', onCancel);
      input.removeListener('close', onCancel);
      process.removeListener('SIGINT', onCancel);
      process.removeListener('SIGTERM', onCancel);
    }
    if (onError) {
      input.removeListener('error', onError);
      output.removeListener('error', onError);
    }
    output.removeListener('resize', resize);
    input.setRawMode(Boolean(wasRaw));
    if (wasPaused) input.pause();
    output.write('\x1b[?25h');
  }
}

export async function promptAgentSelection(available: readonly SetupAgent[]): Promise<SetupAgent[]> {
  let inputFd: number | undefined;
  let outputFd: number | undefined;
  try {
    inputFd = openSync('/dev/tty', 'r');
    outputFd = openSync('/dev/tty', 'w');
  } catch {
    if (inputFd !== undefined) closeSync(inputFd);
    throw new Error(terminalRequired);
  }
  const input = new ReadStream(inputFd);
  const output = new WriteStream(outputFd);
  try { return await readAgentSelection(available, input, output); }
  finally { input.destroy(); output.destroy(); }
}
