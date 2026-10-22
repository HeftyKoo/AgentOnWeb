import { access, mkdir, realpath, rmdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import semver from 'semver';
import { packageDirectory, installedVersion } from './version.js';
import { outsideTerminal, liveEndpoint } from './management.js';
import { serviceDirectory, serviceLoaded, prepareService, reloadService } from './service.js';
import { Updates } from './updates.js';
import { formatHelp } from './cli-help.js';
import { printStatus } from './cli-ui.js';

export function npmPrefix(root: string) {
  const prefix = dirname(dirname(dirname(dirname(root))));
  if (join(prefix, 'lib', 'node_modules', '@agentonweb', 'terminal-host') !== root)
    throw new Error('aow update requires a global npm installation. Reinstall with the official installer, or update through your original package manager.');
  return prefix;
}
async function install(prefix: string, version: string) {
  const npm = join(dirname(process.execPath), 'npm');
  await access(npm, constants.X_OK);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npm, ['install', '--global', '--prefix', prefix, '--foreground-scripts', '--prefer-online',
      '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', `@agentonweb/terminal-host@${version}`], {
      stdio: 'inherit', env: { ...process.env, AOW_SKIP_SETUP: '1', PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` },
      // Finish before the ten-minute maintenance lease expires.
      timeout: 9 * 60 * 1000,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`npm installation failed (${signal ?? code}). The service was not restarted; inspect npm output before retrying.`)));
  });
}
export async function updateCommand(args: string[]) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    console.log(formatHelp('update')); return;
  }
  if (args.length > 1 || args.length === 1 && args[0] !== '--force') throw new Error('Usage: aow update [--force]');
  outsideTerminal();
  if (process.platform !== 'darwin') throw new Error('aow update currently supports global npm installations on macOS. Update through your package manager on this platform.');
  const root = await realpath(packageDirectory);
  const prefix = npmPrefix(root);
  await access(root, constants.W_OK);
  const updates = new Updates(serviceDirectory);
  const status = await updates.check(true);
  if (status.error) throw new Error(status.error);
  const force = args.includes('--force');
  const reinstall = force && status.latest === status.currentVersion;
  if (!status.updateAvailable && !reinstall) { printStatus('ok', `AgentOnWeb ${status.currentVersion} is up to date; no package was changed.`); return; }
  if (status.node && !semver.satisfies(process.versions.node, status.node)) throw new Error(`Version ${status.latest} requires Node.js ${status.node}. Update Node and rerun the installer.`);
  await mkdir(serviceDirectory, { recursive: true, mode: 0o700 });
  const guard = join(serviceDirectory, 'update.guard');
  try { await mkdir(guard, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Another update is in progress. If an earlier update was interrupted, remove ${guard} only after confirming it has stopped.`);
    throw error;
  }
  try {
    const prepared = await prepareService(force);
    try {
      if (!prepared.status && !prepared.legacyPid && serviceLoaded()) throw new Error('The service is loaded but cannot be checked. No package was changed; repair the service first.');
      printStatus('info', reinstall ? `Reinstalling AgentOnWeb ${status.latest} in ${prefix}.` : `Updating AgentOnWeb ${status.currentVersion} → ${status.latest} in ${prefix}.`);
      await install(prefix, status.latest!);
      if (installedVersion() !== status.latest) throw new Error('npm did not install the expected version. The service was not restarted.');
      // Hooks/native registration keep the same absolute paths. Skipping setup
      // preserves the selected CLIs and enrolled unpacked extension origins.
      if (prepared.status || prepared.legacyPid) await reloadService(status.latest!, prepared.legacyPid);
      else {
        if (await liveEndpoint(serviceDirectory)) throw new Error('A host started during installation. Close its terminals, then run aow service restart to activate the installed version.');
        printStatus('ok', `Installed ${status.latest}. Run aow setup if you want to configure the service.`);
      }
    } finally { await prepared.release(); }
  } finally { await rmdir(guard); }
}
