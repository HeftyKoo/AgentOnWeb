import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import semver from 'semver';
import { VERSION } from './version.js';

const DAY = 24 * 60 * 60 * 1000;
const registry = 'https://registry.npmjs.org/@agentonweb%2Fterminal-host/latest';
type Cache = { latest?: string; node?: string; checkedAt?: number; nextCheck?: number; failures?: number; error?: string };
export type UpdateStatus = Cache & { enabled: boolean; currentVersion: string; updateAvailable: boolean };
class RegistryError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
async function saveJson(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, JSON.stringify(value) + '\n', { mode: 0o600 }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
function cacheValue(value: unknown): Cache {
  if (!value || typeof value !== 'object') return {};
  const v = value as Cache;
  const result: Cache = {};
  if (typeof v.latest === 'string' && semver.valid(v.latest) && !semver.prerelease(v.latest)) result.latest = v.latest;
  if (typeof v.node === 'string' && semver.validRange(v.node)) result.node = v.node;
  for (const key of ['checkedAt', 'nextCheck', 'failures'] as const)
    if (typeof v[key] === 'number' && Number.isFinite(v[key]) && v[key] >= 0) result[key] = v[key];
  if (typeof v.error === 'string') result.error = /^Could not check npm for updates \((?:HTTP \d{3}|invalid npm metadata|request timed out|network request failed)\)\. Try aow check-update later\.$/u.test(v.error)
    ? v.error : 'Could not check npm for updates. Try aow check-update later.';
  return result;
}

/** Version queries only; never installs packages or restarts terminal processes. */
export class Updates {
  private pending: Promise<UpdateStatus> | undefined;
  constructor(private readonly directory: string, private readonly options: {
    fetch?: typeof fetch; now?: () => number; version?: string;
  } = {}) {}
  async status(): Promise<UpdateStatus> {
    const config = await readJson(join(this.directory, 'updates.json')) as { enabled?: boolean } | undefined;
    const cache = cacheValue(await readJson(join(this.directory, 'update-cache.json')));
    const version = this.options.version ?? VERSION;
    return { ...cache, enabled: !process.env.CI && process.env.AOW_UPDATE_CHECK !== '0' && config?.enabled !== false,
      currentVersion: version, updateAvailable: !!cache.latest && semver.gt(cache.latest, version) };
  }
  async configure(enabled: boolean) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await saveJson(join(this.directory, 'updates.json'), { enabled });
  }
  check(manual = false): Promise<UpdateStatus> {
    if (this.pending) return this.pending;
    this.pending = this.query(manual).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async metadata(manual: boolean): Promise<{ latest: string; node?: string }> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await (this.options.fetch ?? fetch)(registry, {
          signal: AbortSignal.timeout(manual ? 15000 : 3000), redirect: 'error', headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new RegistryError(`HTTP ${response.status}`, response.status === 429 || response.status >= 500);
        let metadata: { name?: string; version?: string; engines?: { node?: string } } | null;
        try { metadata = await response.json(); }
        catch (error) { if (error instanceof SyntaxError) throw new RegistryError('invalid npm metadata'); throw error; }
        if (metadata?.name !== '@agentonweb/terminal-host' || typeof metadata.version !== 'string'
          || !semver.valid(metadata.version) || semver.prerelease(metadata.version)
          || metadata.engines?.node !== undefined && !semver.validRange(metadata.engines.node)) throw new RegistryError('invalid npm metadata');
        return { latest: metadata.version, ...(metadata.engines?.node ? { node: metadata.engines.node } : {}) };
      } catch (error) {
        if (!manual || attempt >= 1 || error instanceof RegistryError && !error.retryable) throw error;
      }
    }
  }
  private async query(manual: boolean) {
    const status = await this.status();
    const now = (this.options.now ?? Date.now)();
    if (!manual && (!status.enabled || now < (status.nextCheck ?? 0))) return status;
    let cache: Cache;
    try {
      cache = { ...await this.metadata(manual), checkedAt: now, nextCheck: now + DAY, failures: 0 };
    } catch (error) {
      const failures = Math.min((status.failures ?? 0) + 1, 8);
      const reason = error instanceof RegistryError ? error.message : (error as Error)?.name === 'TimeoutError' ? 'request timed out' : 'network request failed';
      cache = { ...(status.latest ? { latest: status.latest } : {}), ...(status.node ? { node: status.node } : {}),
        ...(status.checkedAt !== undefined ? { checkedAt: status.checkedAt } : {}), failures,
        nextCheck: now + Math.min(DAY, 15 * 60 * 1000 * 2 ** (failures - 1)),
        error: `Could not check npm for updates (${reason}). Try aow check-update later.` };
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await saveJson(join(this.directory, 'update-cache.json'), cache);
    return { ...cache, enabled: status.enabled, currentVersion: status.currentVersion,
      updateAvailable: !!cache.latest && semver.gt(cache.latest, status.currentVersion) };
  }
  start(notify: (status: UpdateStatus) => void = () => {}) {
    let notified = '';
    const check = () => { void this.check().then(status => {
      if (status.enabled && status.updateAvailable && status.latest !== notified) {
        notified = status.latest!; notify(status);
      }
    }).catch(() => { /* An unwritable cache must not interfere with terminals. */ }); };
    const first = setTimeout(check, 1000); first.unref();
    // Cache enforces daily checks and exponential failure backoff across restarts.
    const timer = setInterval(check, 15 * 60 * 1000); timer.unref();
    return () => { clearTimeout(first); clearInterval(timer); };
  }
}
