import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hostRequest, liveEndpoint, prepareHost } from './management.js';
import { VERSION } from './version.js';
import { formatHelp } from './cli-help.js';
import { printStatus } from './cli-ui.js';

const label = 'com.agentonweb.terminal';
export const serviceDirectory = join(homedir(), '.agentonweb', 'terminal');
const plist = join(homedir(), 'Library', 'LaunchAgents', label + '.plist');
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function launchAgent(node: string, entry: string, home: string, path: string, shell: string): string {
  const string = (value: string) => '<string>' + escapeXml(value) + '</string>';
  return '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>' +
    '<key>Label</key>' + string(label) +
    '<key>ProgramArguments</key><array>' + [node, entry, 'terminal', '--service'].map(string).join('') + '</array>' +
    '<key>WorkingDirectory</key>' + string(home) +
    '<key>EnvironmentVariables</key><dict><key>PATH</key>' + string(path) + '<key>SHELL</key>' + string(shell) + '</dict>' +
    '<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>' +
    '<key>StandardOutPath</key>' + string(join(home, '.agentonweb/terminal/service.log')) +
    '<key>StandardErrorPath</key>' + string(join(home, '.agentonweb/terminal/service.log')) + '</dict></plist>\n';
}
export async function serviceCommand(args: string[]): Promise<void> {
  const usage = 'Usage: aow service [open | install [--no-open] | status | restart [--force] | uninstall] (default: open)';
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(formatHelp('service'));
    return;
  }
  const action = args[0] ?? 'open';
  if (!['install', 'open', 'status', 'restart', 'uninstall'].includes(action) ||
      (args.length > 1 && !(args.length === 2 && (action === 'install' && args[1] === '--no-open' || action === 'restart' && args[1] === '--force')))) {
    throw new Error(usage);
  }
  if (process.platform !== 'darwin') throw new Error('Automatic service installation currently supports macOS. Run aow terminal on this platform.');
  const domain = 'gui/' + process.getuid!();
  if (action === 'install') {
    await mkdir(serviceDirectory, { recursive: true, mode: 0o700 });
    await mkdir(dirname(plist), { recursive: true });
    // Reinstalling does not interrupt existing shells.
    let running = false;
    try { execFileSync('/bin/launchctl', ['print', domain + '/' + label], { stdio: 'ignore' }); running = true; } catch {}
    await writeFile(plist, launchAgent(process.execPath, fileURLToPath(import.meta.url), homedir(), process.env.PATH || '/usr/bin:/bin', process.env.SHELL || '/bin/zsh'), { mode: 0o600 });
    if (!running) {
      execFileSync('/bin/launchctl', ['bootstrap', domain, plist], { stdio: 'pipe' });
    }
    printStatus('ok', running ? 'Service configuration updated for next login. Existing terminals remain running.' : 'AgentOnWeb terminal service starts automatically at login.');
    if (!args.includes('--no-open')) await openService();
  } else if (action === 'open') await openService();
  else if (action === 'status') {
    try { execFileSync('/bin/launchctl', ['print', domain + '/' + label], { stdio: 'ignore' }); printStatus('ok', 'AgentOnWeb terminal service is loaded.'); }
    catch { printStatus('warn', 'AgentOnWeb terminal service is not loaded.'); }
    printStatus('info', `Installed CLI: ${VERSION}`);
    const endpoint = await liveEndpoint(serviceDirectory);
    if (endpoint) {
      try {
        const status = await hostRequest(endpoint);
        printStatus('info', `Running host: ${status.version} · ${status.activeTerminals} active terminal(s).`);
        if (status.version !== VERSION) printStatus('warn', 'Installed version differs from the running host. Run aow service restart after closing terminals.');
      } catch { printStatus('warn', 'Running host version unavailable. Finish terminal work and restart the older host manually.'); }
    }
  } else if (action === 'restart') {
    const prepared = await prepareHost(serviceDirectory, args.includes('--force'));
    try { await reloadService(VERSION); }
    finally { await prepared.release(); }
  } else if (action === 'uninstall') {
    try { execFileSync('/bin/launchctl', ['bootout', domain + '/' + label], { stdio: 'pipe' }); } catch {}
    await unlink(plist).catch(error => { if (error.code !== 'ENOENT') throw error; });
    printStatus('ok', 'Automatic startup removed. Service terminals stopped; saved CLI history is unchanged.');
  }
}
export function serviceLoaded(): boolean {
  try { execFileSync('/bin/launchctl', ['print', `gui/${process.getuid!()}/${label}`], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
/** Caller holds the host's maintenance lease before reaching this point. */
export async function reloadService(expectedVersion: string) {
  const old = await liveEndpoint(serviceDirectory);
  if (serviceLoaded()) {
    if (!old) throw new Error('The loaded service is not ready. Check service.log before restarting; no service was stopped.');
    execFileSync('/bin/launchctl', ['bootout', `gui/${process.getuid!()}/${label}`], { stdio: 'pipe', timeout: 10000 });
    let stopped = false;
    for (let i = 0; i < 100; i++) {
      try { process.kill(old.pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { stopped = true; break; } throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!stopped) throw new Error('The previous host did not stop. Check service.log before starting another host.');
  }
  await serviceCommand(['install', '--no-open']);
  for (let i = 0; i < 50; i++) {
    try {
      const endpoint = await liveEndpoint(serviceDirectory);
      if (endpoint && endpoint.pid !== old?.pid) {
        const status = await hostRequest(endpoint);
        if (status.version === expectedVersion && status.managedService) {
          printStatus('ok', `AgentOnWeb service is running version ${expectedVersion}.`); return;
        }
      }
    } catch { /* Wait for the new host to publish its endpoint. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Service restart did not confirm version ${expectedVersion}. Check ~/.agentonweb/terminal/service.log and run aow setup to repair it.`);
}
async function openService() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const endpoint = JSON.parse(await readFile(join(serviceDirectory, 'endpoint.json'), 'utf8'));
      process.kill(endpoint.pid, 0);
      const url = new URL(endpoint.launchUrl);
      if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.pathname !== '/launch') throw new Error('Invalid local service endpoint');
      execFileSync('/usr/bin/open', [url.href]); return;
    } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Service did not become ready. Run aow setup to install or repair it, then check ~/.agentonweb/terminal/service.log.');
}
