import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { planAgentSetup, installSelectedAgents, SETUP_AGENTS } from './setup-agents.js';
import type { SetupAgent } from './setup-agents.js';
import { promptAgentSelection } from './setup-selection.js';

vi.mock('./setup-selection.js', () => ({ promptAgentSelection: vi.fn() }));
let root: string;
let bin: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aow CLI selection '));
  bin = join(root, 'bin');
  await mkdir(bin);
  vi.stubEnv('PATH', bin);
  vi.stubEnv('CODEX_HOME', join(root, 'codex'));
  vi.stubEnv('CLAUDE_CONFIG_DIR', join(root, 'claude'));
  vi.stubEnv('PI_CODING_AGENT_DIR', join(root, 'pi'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
async function installCLI(agent: SetupAgent) {
  // Detection must not execute this file.
  await writeFile(join(bin, agent), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
}

it.each(Array.from({ length: 8 }, (_, mask) => [mask, SETUP_AGENTS.filter((_, i) => mask & (1 << i))] as const))(
  'only writes configurations for CLIs on PATH (installation mask %s)', async (_mask, installed) => {
    for (const agent of installed) await installCLI(agent);
    const selected = await planAgentSetup(SETUP_AGENTS);
    expect(selected).toEqual(installed);
    await installSelectedAgents(selected);
    const entries = await readdir(root);
    for (const agent of SETUP_AGENTS) expect(entries.includes(agent)).toBe(installed.includes(agent));
    if (installed.includes('codex')) expect(JSON.parse(await readFile(join(root, 'codex/hooks.json'), 'utf8')).hooks.SessionStart).toHaveLength(1);
    if (installed.includes('claude')) expect(JSON.parse(await readFile(join(root, 'claude/settings.json'), 'utf8')).hooks.SessionStart).toHaveLength(1);
    if (installed.includes('pi')) expect(await readFile(join(root, 'pi/extensions/agentonweb.ts'), 'utf8')).toContain('pi-extension.js');
    expect(promptAgentSelection).not.toHaveBeenCalled();
  },
);

it('asks the user to choose among detected CLIs before any integration is written', async () => {
  await installCLI('codex'); await installCLI('claude');
  vi.mocked(promptAgentSelection).mockResolvedValue(['claude']);
  const selected = await planAgentSetup();
  expect(promptAgentSelection).toHaveBeenCalledWith(['codex', 'claude']);
  expect(await readdir(root)).toEqual(['bin']);
  await installSelectedAgents(selected);
  expect((await readdir(root)).sort()).toEqual(['bin', 'claude']);
});

it('keeps existing settings untouched for missing or unselected CLIs, including malformed settings', async () => {
  await installCLI('codex'); await installCLI('claude');
  await mkdir(join(root, 'claude'));
  await writeFile(join(root, 'claude/settings.json'), '{broken');
  await mkdir(join(root, 'pi'));
  await writeFile(join(root, 'pi/settings.json'), '{broken');
  await installSelectedAgents(await planAgentSetup(['codex', 'pi']));
  expect(await readFile(join(root, 'claude/settings.json'), 'utf8')).toBe('{broken');
  expect(await readdir(join(root, 'pi'))).toEqual(['settings.json']);
});

it('supports none without prompting or writing CLI files even when every CLI is installed', async () => {
  for (const agent of SETUP_AGENTS) await installCLI(agent);
  await installSelectedAgents(await planAgentSetup([]));
  expect(await readdir(root)).toEqual(['bin']);
  expect(promptAgentSelection).not.toHaveBeenCalled();
});

it('does not mistake saved settings, directories, broken symlinks or non-executable files for installed CLIs', async () => {
  await mkdir(join(bin, 'codex'));
  await symlink(join(root, 'missing'), join(bin, 'claude'));
  await writeFile(join(bin, 'pi'), '#!/bin/sh\n', { mode: 0o600 });
  await mkdir(join(root, 'codex'));
  await writeFile(join(root, 'codex/config.toml'), 'model = "existing"\n');
  expect(await planAgentSetup()).toEqual([]);
  expect(promptAgentSelection).not.toHaveBeenCalled();
  expect(await readdir(join(root, 'codex'))).toEqual(['config.toml']);
});

it('detects executable npm symlinks and searches past an unusable PATH entry', async () => {
  const second = join(root, 'second bin');
  await mkdir(second);
  await mkdir(join(bin, 'pi'));
  await writeFile(join(root, 'pi-cli'), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
  await symlink(join(root, 'pi-cli'), join(second, 'pi'));
  vi.stubEnv('PATH', `${bin}:${second}`);
  expect(await planAgentSetup(SETUP_AGENTS)).toEqual(['pi']);
});
