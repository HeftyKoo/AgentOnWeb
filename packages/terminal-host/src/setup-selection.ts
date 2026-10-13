import { closeSync, openSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { ReadStream, WriteStream } from 'node:tty';
import type { Readable, Writable } from 'node:stream';
import type { SetupAgent } from './setup-agents.js';

const names = { codex: 'Codex hooks', claude: 'Claude Code hooks', pi: 'Pi extension' };

/** A numbered selection also works without raw-mode key handling or extra dependencies. */
export async function readAgentSelection(available: readonly SetupAgent[], input: Readable, output: Writable): Promise<SetupAgent[]> {
  const readline = createInterface({ input, output, terminal: Boolean((output as WriteStream).isTTY) });
  const cancelled = new AbortController();
  const cancel = () => cancelled.abort();
  readline.once('close', cancel);
  readline.once('SIGINT', cancel);
  input.once('end', cancel);
  try {
    output.write('\nChoose AgentOnWeb integrations to install:\n');
    available.forEach((agent, index) => output.write(`  ${index + 1}) ${names[agent]}\n`));
    output.write('  all) All detected CLIs (default)\n  0) Skip CLI integrations; configure the terminal service only\n');
    output.write('Enter numbers or CLI names separated by commas.\n');
    while (true) {
      const answer = (await readline.question('Selection [all]: ', { signal: cancelled.signal })).trim().toLowerCase();
      if (answer === '' || answer === 'all') return [...available];
      if (answer === '0' || answer === 'none') return [];
      const choices = answer.split(',').map(value => value.trim());
      const selected = choices.map(value => available.find((agent, index) => value === agent || value === String(index + 1)));
      if (selected.every((agent): agent is SetupAgent => agent !== undefined)) return [...new Set(selected)];
      output.write('Choose listed numbers or CLI names separated by commas (for example 1,2 or codex,claude), all, or 0.\n');
    }
  } catch (error) {
    if (cancelled.signal.aborted) throw new Error('Setup cancelled before installing integrations or configuring the service.');
    throw error;
  } finally {
    input.removeListener('end', cancel);
    readline.close();
  }
}

export async function promptAgentSelection(available: readonly SetupAgent[]): Promise<SetupAgent[]> {
  let inputFd: number | undefined;
  let outputFd: number | undefined;
  try {
    // curl | bash consumes stdin, and the installer redirects child stdin to /dev/null.
    // The controlling terminal remains available for the user's selection.
    inputFd = openSync('/dev/tty', 'r');
    outputFd = openSync('/dev/tty', 'w');
  } catch {
    if (inputFd !== undefined) closeSync(inputFd);
    throw new Error('Interactive setup needs a terminal. Run aow setup in a terminal, or pass --agents all, --agents codex,claude,pi, or --agents none for unattended setup.');
  }
  const input = new ReadStream(inputFd);
  const output = new WriteStream(outputFd);
  try { return await readAgentSelection(available, input, output); }
  finally { input.destroy(); output.destroy(); }
}
