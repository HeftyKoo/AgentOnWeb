import { PassThrough } from 'node:stream';
import type { ReadStream, WriteStream } from 'node:tty';
import * as fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readAgentSelection, promptAgentSelection } from './setup-selection.js';
import type { SetupAgent } from './setup-agents.js';

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, openSync: vi.fn(original.openSync) };
});
beforeEach(() => vi.stubEnv('TERM', 'xterm-256color'));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function terminal(columns = 80, raw = false) {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: raw, setRawMode: vi.fn() });
  const output = Object.assign(new PassThrough(), { isTTY: true, columns });
  let text = '';
  output.on('data', chunk => { text += String(chunk); });
  return { input, output, text: () => text, read: (agents: readonly SetupAgent[] = ['codex', 'claude', 'pi']) =>
    readAgentSelection(agents, input as unknown as ReadStream, output as unknown as WriteStream) };
}

async function choose(keys: string, agents?: readonly SetupAgent[]) {
  const term = terminal();
  const result = term.read(agents);
  term.input.write(keys);
  try { return { selected: await result, text: term.text(), term }; }
  finally { term.input.destroy(); term.output.destroy(); }
}

it('shows checkboxes with every detected CLI selected by default', async () => {
  const result = await choose('\r');
  expect(result.selected).toEqual(['codex', 'claude', 'pi']);
  expect(result.text).toContain('> [x] Codex hooks');
  expect(result.text).toContain('  [x] Claude Code hooks');
  expect(result.text).toContain('  [x] Pi extension');
  expect(result.text).toContain('Space toggle');
  expect(result.text).not.toContain('Selection [all]');
  expect(result.text).toContain('Selected: Codex hooks, Claude Code hooks, Pi extension.');
});

it.each(Array.from({ length: 8 }, (_, mask) => [mask, ['codex', 'claude', 'pi'].filter((_, i) => mask & (1 << i))]))(
  'supports any subset with Space and arrow keys (mask %s)', async (mask, selected) => {
    let keys = 'a';
    for (let i = 0; i < 3; i++) keys += (Number(mask) & (1 << i) ? ' ' : '') + '\x1b[B';
    expect((await choose(keys + '\r')).selected).toEqual(selected);
  },
);

it('supports select/clear all and invert without a required selection', async () => {
  expect((await choose('a\r')).selected).toEqual([]);
  expect((await choose('aa\r')).selected).toEqual(['codex', 'claude', 'pi']);
  expect((await choose(' i\r')).selected).toEqual(['codex']);
  expect((await choose('a\r')).text).toContain('terminal service only');
});

it('wraps navigation and only offers detected CLIs', async () => {
  expect((await choose('\x1b[A \r', ['codex', 'pi'])).selected).toEqual(['codex']);
});

it('ignores typed numbers and does not treat them as selection', async () => {
  expect((await choose('1,3\r')).selected).toEqual(['codex', 'claude', 'pi']);
});

it.each(['\x03', '\x04', '\x1b'])('cancels with keyboard input %j and restores terminal state', async keys => {
  const term = terminal();
  const sigint = process.listenerCount('SIGINT');
  const sigterm = process.listenerCount('SIGTERM');
  const result = term.read();
  term.input.write(keys);
  await expect(result).rejects.toThrow('Setup cancelled before installing');
  expect(term.input.setRawMode.mock.calls).toEqual([[true], [false]]);
  expect(term.input.listenerCount('keypress')).toBe(0);
  expect(term.output.listenerCount('resize')).toBe(0);
  expect(process.listenerCount('SIGINT')).toBe(sigint);
  expect(process.listenerCount('SIGTERM')).toBe(sigterm);
  expect(term.input.isPaused()).toBe(true);
  expect(term.text()).toContain('\x1b[?25h');
  term.input.destroy(); term.output.destroy();
});

it('cancels on EOF rather than accepting the default', async () => {
  const term = terminal();
  const result = term.read();
  term.input.end();
  await expect(result).rejects.toThrow('Setup cancelled');
  expect(term.input.setRawMode).toHaveBeenLastCalledWith(false);
  term.output.destroy();
});

it('restores pre-existing raw mode and handles resize without losing selection', async () => {
  const term = terminal(80, true);
  const result = term.read();
  term.input.write(' ');
  term.output.columns = 40;
  term.output.emit('resize');
  term.input.write('\r');
  expect(await result).toEqual(['claude', 'pi']);
  expect(term.input.setRawMode).toHaveBeenLastCalledWith(true);
  expect(term.text()).toContain('2/3 selected.');
  term.input.destroy(); term.output.destroy();
});

it('does not let buffered keys change a confirmed selection', async () => {
  expect((await choose('\r a')).selected).toEqual(['codex', 'claude', 'pi']);
});

it('requires explicit --agents when there is no controlling terminal', async () => {
  vi.mocked(fs.openSync).mockImplementationOnce(() => { throw new Error('No controlling terminal'); });
  await expect(promptAgentSelection(['codex'])).rejects.toThrow('pass --agents');
});

it('does not show a keyboard prompt on an unsupported terminal', async () => {
  vi.stubEnv('TERM', 'dumb');
  const term = terminal();
  await expect(term.read()).rejects.toThrow('pass --agents');
  expect(term.input.setRawMode).not.toHaveBeenCalled();
  expect(term.text()).toBe('');
  term.input.destroy(); term.output.destroy();
});
