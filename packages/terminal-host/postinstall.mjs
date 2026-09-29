import './fix-pty-permissions.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Workspace/dependency installs never configure the user's machine.
if (process.env.npm_config_global === 'true' && process.env.AOW_SKIP_SETUP !== '1' && !process.env.CI) {
  if (process.platform !== 'darwin') {
    console.warn('AgentOnWeb automatic setup skipped: it currently supports macOS + Chrome. Run aow terminal for a foreground host.');
  } else if (process.getuid?.() === 0) {
    console.warn('AgentOnWeb automatic setup skipped under root. Run aow setup as your own user, without sudo.');
  } else {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./lib/cli.js', import.meta.url)), 'setup'], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error('AgentOnWeb setup is incomplete. Run aow setup to retry.');
      process.exitCode = 1;
    }
  }
}
