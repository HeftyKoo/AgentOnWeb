import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  if (process.platform !== 'darwin') throw new Error('Automatic service installation currently supports macOS. Run aow terminal on this platform.');
  const action = args[0];
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
    console.log(running ? 'Service configuration updated for next login. Existing terminals remain running.' : 'AgentOnWeb terminal service starts automatically at login.');
    if (!args.includes('--no-open')) await openService();
  } else if (action === 'open') await openService();
  else if (action === 'status') {
    try { execFileSync('/bin/launchctl', ['print', domain + '/' + label], { stdio: 'ignore' }); console.log('AgentOnWeb terminal service is loaded.'); }
    catch { console.log('AgentOnWeb terminal service is not loaded.'); }
  } else if (action === 'uninstall') {
    try { execFileSync('/bin/launchctl', ['bootout', domain + '/' + label], { stdio: 'pipe' }); } catch {}
    await unlink(plist).catch(error => { if (error.code !== 'ENOENT') throw error; });
    console.log('Automatic startup removed. Service terminals stopped; saved CLI history is unchanged.');
  } else throw new Error('Usage: aow service install [--no-open] | open | status | uninstall');
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
  throw new Error('Service did not become ready. Check ~/.agentonweb/terminal/service.log.');
}
