import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type HostStatus = { version: string; activeTerminals: number; managedService: boolean };
type Endpoint = { pid: number; nativeToken: string; launchUrl: string; version?: string; managedService?: boolean };
export class HostControlError extends Error {
  constructor(message: string, readonly status: number, readonly legacyPid?: number) { super(message); }
}
export class Maintenance {
  private lease: { token: string; expires: number } | undefined;
  get active() { return !!this.lease && this.lease.expires > Date.now(); }
  prepare(activeTerminals: number, force: boolean) {
    if (this.active) throw new Error('Another update or restart is in progress.');
    if (activeTerminals && !force) throw new Error(`${activeTerminals} active terminal(s). Exit or close them first, or use --force to end their tasks.`);
    const token = randomUUID();
    this.lease = { token, expires: Date.now() + 10 * 60 * 1000 };
    return token;
  }
  release(token: string) { if (this.lease?.token === token) this.lease = undefined; }
}
export async function liveEndpoint(directory: string): Promise<Endpoint | undefined> {
  let value: Endpoint;
  try { value = JSON.parse(await readFile(join(directory, 'endpoint.json'), 'utf8')) as Endpoint; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  if (!Number.isSafeInteger(value.pid) || value.pid < 1) throw new Error('Invalid host PID. Run aow setup to repair the service.');
  try { process.kill(value.pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return undefined; throw error; }
  const url = new URL(value.launchUrl);
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.pathname !== '/launch' || !url.port
    || typeof value.nativeToken !== 'string') throw new Error('Invalid local service endpoint. Run aow setup to repair it.');
  return value;
}
export async function hostRequest(endpoint: Endpoint, action?: object) {
  const response = await fetch(new URL('/service-control', endpoint.launchUrl), {
    ...(action ? { method: 'POST', body: JSON.stringify(action) } : {}), redirect: 'error',
    signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${endpoint.nativeToken}`, 'content-type': 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: string } | undefined;
    const legacy = !action && endpoint.version === undefined && endpoint.managedService === undefined && [401, 404, 405].includes(response.status);
    const message = legacy
      ? `The running host does not support safe updates (HTTP ${response.status}); its active terminals cannot be checked. Finish terminal work, then run aow service restart --force or aow update --force. This ends all service terminal tasks. For a foreground host, stop aow terminal first.`
      : `The running host rejected the control request (HTTP ${response.status}). Run aow service status. If this persists, finish terminal work, then run aow service uninstall followed by aow service install.`;
    throw new HostControlError(typeof body?.error === 'string' ? body.error : message, response.status, legacy ? endpoint.pid : undefined);
  }
  return response.json();
}
export function outsideTerminal() {
  if (process.env.AOW_AGENT_ENDPOINT) throw new Error('Run this command in a separate macOS Terminal, outside AgentOnWeb.');
  if (process.getuid?.() === 0) throw new Error('Run this command as your own user, without sudo.');
}
export async function prepareHost(directory: string, force: boolean) {
  outsideTerminal();
  const endpoint = await liveEndpoint(directory);
  if (!endpoint) return { status: undefined, release: async () => {} };
  const status = await hostRequest(endpoint) as HostStatus;
  if (!status || typeof status.version !== 'string' || !Number.isInteger(status.activeTerminals) || status.activeTerminals < 0 || typeof status.managedService !== 'boolean')
    throw new Error('Invalid host status. Restart the host manually after finishing terminal work.');
  if (!status.managedService) throw new Error('A foreground host is running. Stop aow terminal before updating or restarting the service.');
  const { token } = await hostRequest(endpoint, { action: 'prepare', force }) as { token: string };
  return { status, release: async () => { await hostRequest(endpoint, { action: 'release', token }).catch(() => {}); } };
}
