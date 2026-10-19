import { executablePath } from './launch.js';
import { installCodexHooks } from './codex-hooks.js';
import { installClaudeHooks } from './claude-hooks.js';
import { installPiExtension } from './pi-hooks.js';
import { promptAgentSelection } from './setup-selection.js';
import { printStatus } from './cli-ui.js';

export const SETUP_AGENTS = ['codex', 'claude', 'pi'] as const;
export type SetupAgent = typeof SETUP_AGENTS[number];

const integrations = [
  { id: 'codex', name: 'Codex', kind: 'hooks', install: installCodexHooks,
    guidance: 'Review and trust AgentOnWeb session status in /hooks, then start a new Codex session. Any skipped notify configuration is reported above.' },
  { id: 'claude', name: 'Claude Code', kind: 'hooks', install: installClaudeHooks,
    guidance: 'Review AgentOnWeb session status in /hooks, then start a new Claude Code session.' },
  { id: 'pi', name: 'Pi', kind: 'extension', install: installPiExtension,
    guidance: 'Start Pi 1.1+ in an AgentOnWeb terminal, or use /reload in Pi.' },
] as const;

/** Detect executable CLIs without launching them or treating saved settings as an installation. */
export async function planAgentSetup(requested?: readonly SetupAgent[]): Promise<SetupAgent[]> {
  const detected = await Promise.all(integrations.map(async integration => {
    try { return { integration, path: await executablePath(integration.id) }; }
    catch { return { integration, path: undefined }; }
  }));
  const names = detected.filter(value => value.path).map(value => value.integration.name);
  printStatus('info', `Detected CLIs on PATH: ${names.length ? names.join(', ') : 'none'}.`);
  const available = detected.filter(value => value.path).map(value => value.integration.id);
  const selected = requested ?? (available.length ? await promptAgentSelection(available) : []);
  for (const { integration, path } of detected) {
    const label = `${integration.name} ${integration.kind}`;
    if (!path) {
      printStatus('skip', `${label}: CLI "${integration.id}" not found on PATH.`);
    } else if (!selected.includes(integration.id)) {
      printStatus('skip', `${label}: not selected.`);
    }
  }
  if (!names.length) printStatus('info', 'Install your preferred CLI and add it to PATH, then rerun aow setup to enable its notifications.');
  return available.filter(agent => selected.includes(agent));
}

export async function installSelectedAgents(selected: readonly SetupAgent[]): Promise<void> {
  for (const integration of integrations) {
    if (!selected.includes(integration.id)) continue;
    await integration.install();
    printStatus('ok', `${integration.name} ${integration.kind} installed; existing settings preserved.`);
    printStatus('info', integration.guidance);
  }
}
