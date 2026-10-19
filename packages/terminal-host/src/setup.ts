import { createRequire } from 'node:module';
import { access, chmod, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { uninstallCodexHooks } from './codex-hooks.js';
import { uninstallClaudeHooks } from './claude-hooks.js';
import { uninstallPiExtension } from './pi-hooks.js';
import { planAgentSetup, installSelectedAgents, SETUP_AGENTS } from './setup-agents.js';
import type { SetupAgent } from './setup-agents.js';
import { installNativeBridge, uninstallNativeBridge, extensionOrigin, STORE_EXTENSION_ID } from './native-bridge.js';
import { serviceCommand, serviceDirectory } from './service.js';
import { cleanup } from './cleanup.js';
import { formatHelp, SETUP_USAGE } from './cli-help.js';
import { printStatus, terminalUi } from './cli-ui.js';

export { SETUP_USAGE } from './cli-help.js';

export async function setup(args: string[]) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(formatHelp('setup'));
    return;
  }
  if (process.platform !== 'darwin') throw new Error('One-command setup currently supports macOS + Chrome. Other platforms can use aow terminal.');
  if (process.getuid?.() === 0) throw new Error('Run setup as your own user, without sudo.');
  const ids: string[] = [];
  let agents: readonly SetupAgent[] | undefined;
  let agentsSpecified = false;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    const value = args[++i];
    if (!value) throw new Error(SETUP_USAGE);
    if (option === '--extension-id') {
      extensionOrigin(value); ids.push(value);
    } else if (option === '--agents' && !agentsSpecified) {
      agentsSpecified = true;
      const names = value.split(',');
      if (value === 'all') agents = SETUP_AGENTS;
      else if (value === 'none') agents = [];
      else if (names.every((name): name is SetupAgent => SETUP_AGENTS.some(agent => agent === name))) agents = [...new Set(names)];
      else throw new Error(SETUP_USAGE);
    } else throw new Error(SETUP_USAGE);
  }
  const entry = resolve(process.argv[1]!);
  try {
    await access(process.execPath, constants.X_OK);
    await access(entry, constants.R_OK);
  } catch (cause) {
    throw new Error('Cannot access the Node executable or AgentOnWeb CLI. Reinstall @agentonweb/terminal-host with the intended Node version, then rerun aow setup.', { cause });
  }
  // This also works when npm blocks lifecycle scripts.
  const require = createRequire(import.meta.url);
  const helper = join(dirname(require.resolve('node-pty/package.json')), 'prebuilds', `darwin-${process.arch}`, 'spawn-helper');
  console.log(terminalUi().banner('SETUP'));
  const selected = await planAgentSetup(agents);
  await chmod(helper, 0o755);
  await installSelectedAgents(selected);
  await installNativeBridge(entry, ids);
  await serviceCommand(['install', '--no-open']);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const endpoint = JSON.parse(await readFile(join(serviceDirectory, 'endpoint.json'), 'utf8'));
      process.kill(endpoint.pid, 0);
      if (typeof endpoint.nativeToken !== 'string') throw new Error('Older host');
      const url = new URL(endpoint.launchUrl);
      if (url.protocol !== 'http:' || url.hostname !== 'localhost') throw new Error('Invalid host');
      const response = await fetch(url.origin + '/native-pair', { method: 'POST', signal: AbortSignal.timeout(500),
        headers: { authorization: `Bearer ${endpoint.nativeToken}` }, body: JSON.stringify({ type: 'probe', origin: extensionOrigin(ids[0] ?? STORE_EXTENSION_ID) }) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the service to publish its live endpoint. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Setup saved, but the running host is not ready for automatic pairing. Finish active terminal work, then run aow service uninstall && aow setup. See ~/.agentonweb/terminal/service.log.');
  printStatus('ok', 'Local service is ready.');
  printStatus('info', 'Setup records absolute Node/package paths. Before removing that Node installation or moving the package, reinstall under the intended Node version and rerun aow setup.');
  printStatus('info', 'First installation: Chrome connects automatically on its next setup check (up to 5 minutes after failed attempts). Previously revoked or reset connections require manual pairing.');
}

export async function uninstall(): Promise<void> {
  if (process.getuid?.() === 0) throw new Error('Run uninstall as your own user, without sudo.');
  // Clean integrations before npm removes the CLI used by their commands.
  await cleanup([
    () => uninstallCodexHooks(),
    () => uninstallClaudeHooks(),
    () => uninstallPiExtension(),
    () => uninstallNativeBridge(),
    async () => { if (process.platform === 'darwin') await serviceCommand(['uninstall']); },
  ], 'AgentOnWeb uninstall is incomplete. All integrations were attempted; fix the reported errors and rerun aow uninstall before removing the npm package.');
  printStatus('ok', 'AgentOnWeb hooks, notify forwarding, native bridge and service removed. Backups, browser grants, pairing receipts and CLI history are retained. You can now run npm uninstall -g @agentonweb/terminal-host.');
}
