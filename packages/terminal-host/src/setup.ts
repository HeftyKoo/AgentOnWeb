import { createRequire } from 'node:module';
import { access, chmod, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { installCodexHooks, uninstallCodexHooks } from './codex-hooks.js';
import { installNativeBridge, uninstallNativeBridge, extensionOrigin, STORE_EXTENSION_ID } from './native-bridge.js';
import { serviceCommand, serviceDirectory } from './service.js';
import { cleanup } from './cleanup.js';

export async function setup(args: string[]) {
  if (process.platform !== 'darwin') throw new Error('One-command setup currently supports macOS + Chrome. Other platforms can use aow terminal.');
  if (process.getuid?.() === 0) throw new Error('Run setup as your own user, without sudo.');
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--extension-id' || !args[i + 1]) throw new Error('Usage: aow setup [--extension-id CHROME_EXTENSION_ID]');
    const id = args[++i]!; extensionOrigin(id); ids.push(id);
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
  await chmod(join(dirname(require.resolve('node-pty/package.json')), 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755);
  await installCodexHooks();
  console.log('Codex hooks installed; existing settings preserved. Any skipped notify configuration is reported above.');
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
  console.log('Local service is ready.');
  console.log('Setup records absolute Node/package paths. Before removing that Node installation or moving the package, reinstall under the intended Node version and rerun aow setup.');
  console.log('First installation: Chrome connects automatically on its next setup check (up to 5 minutes after failed attempts). Previously revoked or reset connections require manual pairing.');
  console.log('Codex hook trust is still required: open /hooks once, review AgentOnWeb session status, then start a new Codex session. Installing configuration does not grant hook trust.');
}

export async function uninstall(): Promise<void> {
  if (process.getuid?.() === 0) throw new Error('Run uninstall as your own user, without sudo.');
  // Clean integrations before npm removes the CLI used by their commands.
  await cleanup([
    () => uninstallCodexHooks(),
    () => uninstallNativeBridge(),
    async () => { if (process.platform === 'darwin') await serviceCommand(['uninstall']); },
  ], 'AgentOnWeb uninstall is incomplete. All integrations were attempted; fix the reported errors and rerun aow uninstall before removing the npm package.');
  console.log('AgentOnWeb hooks, notify forwarding, native bridge and service removed. Backups, browser grants, pairing receipts and CLI history are retained. You can now run npm uninstall -g @agentonweb/terminal-host.');
}
