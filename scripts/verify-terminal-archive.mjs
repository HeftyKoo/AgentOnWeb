import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execute = promisify(execFile);

/** Exercise the shipped host and its installed dependencies, outside the workspace. */
export async function verifyTerminalArchive(archive, root) {
  const directory = await mkdtemp(resolve(tmpdir(), 'agentonweb-terminal-package-'));
  let host;
  let socket;
  let exited;
  try {
    const listing = (await execute('tar', ['-tf', archive])).stdout.trim().split('\n').sort();
    assert.deepEqual(listing, [
      'package/LICENSE', 'package/README.md', 'package/package.json', 'package/fix-pty-permissions.mjs',
      'package/lib/cli.js', 'package/lib/public/index.html', 'package/lib/public/main.js', 'package/lib/public/main.css',
    ].sort(), 'Unexpected terminal archive contents');
    await execute('npm', ['install', '--prefix', directory, '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', archive], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const installed = resolve(directory, 'node_modules/@agentonweb/terminal-host');
    assert.equal(await readFile(resolve(installed, 'README.md'), 'utf8'), await readFile(resolve(root, 'packages/terminal-host/README.md'), 'utf8'));
    const entry = resolve(installed, 'lib/cli.js');
    assert.match((await execute(process.execPath, [entry, '--help'], { cwd: directory })).stdout, /aow terminal/);
    const home = resolve(directory, 'home');
    await mkdir(home);
    // No service commands or user startup files are used by this smoke test.
    host = spawn(process.execPath, [entry, 'terminal'], {
      cwd: directory, env: { ...process.env, HOME: home, SHELL: '/bin/sh', ENV: undefined, BASH_ENV: undefined, ZDOTDIR: undefined }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    exited = once(host, 'exit');
    let output = '';
    let errors = '';
    host.stdout.on('data', chunk => { output += String(chunk); });
    host.stderr.on('data', chunk => { errors += String(chunk); });
    const waitFor = async (check) => {
      const deadline = Date.now() + 10000;
      while (!check()) {
        if (host.exitCode !== null || host.signalCode !== null) throw new Error(`Packed terminal host stopped unexpectedly: ${errors}`);
        if (Date.now() >= deadline) throw new Error(`Packed terminal smoke test timed out: ${errors}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    await waitFor(() => output.includes('Open once:'));
    const launchUrl = /Open once: (http:\/\/[^\s]+)/u.exec(output)[1];
    const origin = new URL(launchUrl).origin;
    const launch = await fetch(launchUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    assert.equal(launch.status, 200);
    assert.equal(launch.headers.get('location'), null);
    assert.ok((await launch.text()).includes('Terminal sessions'));
    const cookie = launch.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
    const headers = { Cookie: cookie, 'X-AgentOnWeb-Terminal': '1' };
    for (const [path, contentType] of [['/', 'text/html'], ['/main.js', 'text/javascript'], ['/main.css', 'text/css']]) {
      const response = await fetch(origin + path, { headers, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(contentType));
      assert.ok((await response.text()).length > 0);
    }
    const response = await fetch(origin + '/ticket', { headers, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    const ticket = await response.json();
    const { WebSocket } = createRequire(entry)('ws');
    socket = new WebSocket(origin.replace('http:', 'ws:') + '/terminal', ticket.token, { headers: { Cookie: cookie, Origin: origin } });
    let text = '';
    let sent = false;
    let socketError;
    socket.on('error', error => { socketError = error; });
    socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      if (message.type === 'snapshot' || message.type === 'output') text += message.data;
      if (message.type === 'control' && message.active && !sent) {
        sent = true;
        socket.send(JSON.stringify({ type: 'input', epoch: message.epoch, lease: message.lease, data: "printf 'AOW_PACKED_%s_OK\\n' SHELL\n" }));
      }
    });
    await waitFor(() => { if (socketError) throw socketError; return text.includes('AOW_PACKED_SHELL_OK'); });
    console.log('Packed terminal host passed: isolated production install, browser assets and real shell input/output.');
  } finally {
    socket?.terminate();
    if (host && host.exitCode === null && host.signalCode === null) {
      host.kill('SIGTERM');
      const force = setTimeout(() => host.kill('SIGKILL'), 5000);
      try { await exited; } finally { clearTimeout(force); }
    }
    await rm(directory, { recursive: true, force: true });
  }
}
