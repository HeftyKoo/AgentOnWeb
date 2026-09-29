import { readFile, writeFile, mkdir, chmod, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { cleanup } from './cleanup.js';

export const NATIVE_HOST = 'com.agentonweb.terminal';
export const STORE_EXTENSION_ID = 'lhbmeokjjcmklamnepcechnpcdjgkcoe';
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
export function extensionOrigin(id: string): string {
  if (!/^[a-p]{32}$/u.test(id)) throw new Error('Invalid Chrome extension ID.');
  return `chrome-extension://${id}`;
}
export async function installNativeBridge(entry: string, extraIds: string[] = [], home = homedir()) {
  const origins = [...new Set([STORE_EXTENSION_ID, ...extraIds].map(extensionOrigin))];
  const directory = join(home, '.agentonweb', 'terminal');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const launcher = join(directory, 'native-host');
  await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(entry)} native-host "$@"\n`, { mode: 0o700 });
  await chmod(launcher, 0o700);
  await writeFile(join(directory, 'native-origins.json'), JSON.stringify(origins), { mode: 0o600 });
  for (const browser of ['Chrome', 'Chrome for Testing']) {
    const manifest = join(home, 'Library', 'Application Support', 'Google', browser, 'NativeMessagingHosts', NATIVE_HOST + '.json');
    await mkdir(dirname(manifest), { recursive: true });
    await writeFile(manifest, JSON.stringify({ name: NATIVE_HOST, description: 'AgentOnWeb local terminal setup', path: launcher, type: 'stdio', allowed_origins: origins.map(origin => origin + '/') }, null, 2) + '\n', { mode: 0o600 });
  }
}
export async function uninstallNativeBridge(home = homedir()): Promise<void> {
  const paths = [
    ...['Chrome', 'Chrome for Testing'].map(browser => join(home, 'Library', 'Application Support', 'Google', browser, 'NativeMessagingHosts', NATIVE_HOST + '.json')),
    ...['native-host', 'native-origins.json'].map(name => join(home, '.agentonweb', 'terminal', name)),
  ];
  await cleanup(paths.map(path => () => rm(path, { force: true })), 'Native bridge cleanup is incomplete.');
}
export async function nativeOrigins(directory: string): Promise<string[]> {
  try {
    const value: unknown = JSON.parse(await readFile(join(directory, 'native-origins.json'), 'utf8'));
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && /^chrome-extension:\/\/[a-p]{32}$/u.test(s)) : [];
  } catch { return []; }
}
export async function readNativeMessage(input: AsyncIterable<Buffer>): Promise<unknown> {
  let buffer = Buffer.alloc(0);
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length >= 4) {
      const size = buffer.readUInt32LE(0);
      if (!size || size > 4096) throw new Error('Invalid native message size.');
      if (buffer.length >= size + 4) return JSON.parse(buffer.subarray(4, size + 4).toString('utf8'));
    }
  }
  throw new Error('Incomplete native message.');
}
export function encodeNativeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
/** Chrome supplies the caller origin as argv; request JSON cannot override it. */
export async function nativeRequest(directory: string, caller: string, message: unknown): Promise<unknown> {
  const origin = caller.replace(/\/$/u, '');
  if (!(await nativeOrigins(directory)).includes(origin)) throw new Error('Extension not allowed.');
  const input = message as { type?: string; expectedOrigin?: string } | null;
  if (!input || !['probe', 'pair'].includes(input.type ?? '')) throw new Error('Unsupported native request.');
  const endpoint = JSON.parse(await readFile(join(directory, 'endpoint.json'), 'utf8'));
  const url = new URL(endpoint.launchUrl);
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.pathname !== '/launch' || !url.port || typeof endpoint.nativeToken !== 'string') throw new Error('Run aow setup to update the host.');
  if (input.type === 'pair' && input.expectedOrigin !== url.origin) throw new Error('Different runtime.');
  const response = await fetch(`${url.origin}/native-pair`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${endpoint.nativeToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ type: input.type, origin }) });
  if (!response.ok) throw new Error('Native setup unavailable.');
  return response.json();
}
export async function runNativeHost(caller: string, directory: string) {
  const timer = setTimeout(() => process.exit(1), 5000); timer.unref();
  let response: unknown;
  try { response = await nativeRequest(directory, caller, await readNativeMessage(process.stdin)); }
  catch { response = { ok: false }; }
  process.stdout.write(encodeNativeMessage(response));
}
