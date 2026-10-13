import { PassThrough } from 'node:stream';
import * as fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { readAgentSelection, promptAgentSelection } from './setup-selection.js';

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, openSync: vi.fn(original.openSync) };
});
afterEach(() => vi.restoreAllMocks());

async function choose(answers: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', chunk => {
    text += String(chunk);
    if (String(chunk).includes('Selection [all]:')) queueMicrotask(() => {
      const answer = answers.shift();
      if (answer === undefined) input.end();
      else input.write(answer + '\n');
    });
  });
  try { return { selected: await readAgentSelection(['codex', 'claude', 'pi'], input, output), text }; }
  finally { input.destroy(); output.destroy(); }
}

it.each([
  ['', ['codex', 'claude', 'pi']],
  ['all', ['codex', 'claude', 'pi']],
  ['1,3', ['codex', 'pi']],
  ['claude, codex,claude', ['claude', 'codex']],
  ['0', []],
  ['none', []],
])('accepts terminal selection %s', async (answer, selected) => {
  const result = await choose([answer as string]);
  expect(result.selected).toEqual(selected);
  expect(result.text).toContain('1) Codex hooks');
  expect(result.text).toContain('2) Claude Code hooks');
  expect(result.text).toContain('3) Pi extension');
});

it('reprompts invalid or unavailable choices without accepting a partial selection', async () => {
  const result = await choose(['codex,unknown', '4', '2']);
  expect(result.selected).toEqual(['claude']);
  expect(result.text.match(/Selection \[all\]:/g)).toHaveLength(3);
});

it('cancels on EOF instead of silently accepting the default', async () => {
  await expect(choose([])).rejects.toThrow('Setup cancelled');
});

it('requires explicit --agents when there is no controlling terminal', async () => {
  vi.mocked(fs.openSync).mockImplementationOnce(() => { throw new Error('No controlling terminal'); });
  await expect(promptAgentSelection(['codex'])).rejects.toThrow('pass --agents');
});
