import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
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
      'package/LICENSE', 'package/README.md', 'package/package.json', 'package/postinstall.mjs', 'package/fix-pty-permissions.mjs',
      'package/lib/cli.js', 'package/lib/agent-hook.js', 'package/lib/pi-extension.js', 'package/lib/public/index.html', 'package/lib/public/main.js', 'package/lib/public/main.css',
    ].sort(), 'Unexpected terminal archive contents');
    await execute('npm', ['install', '--prefix', directory, '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', archive], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const installed = resolve(directory, 'node_modules/@agentonweb/terminal-host');
    const bin = resolve(directory, 'node_modules/.bin/aow');
    assert.equal(await readFile(resolve(installed, 'README.md'), 'utf8'), await readFile(resolve(root, 'packages/terminal-host/README.md'), 'utf8'));
    const entry = resolve(installed, 'lib/cli.js');
    assert.match((await execute(process.execPath, [entry, '--help'], { cwd: directory })).stdout, /aow terminal/);
    assert.match((await execute(process.execPath, [entry, 'service', '--help'], { cwd: directory })).stdout, /default: open/);
    await assert.rejects(execute(process.execPath, [entry, 'service', 'unknown'], { cwd: directory }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /^aow: Usage: aow service [^\n]+\n$/);
      return true;
    });
    const home = resolve(directory, 'home');
    await mkdir(home);
    const claudeDirectory = resolve(home, '.claude');
    await mkdir(claudeDirectory);
    const settingsPath = resolve(claudeDirectory, 'settings.json');
    const settings = { model: 'user-model', permissions: { ask: ['Bash'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-stop-hook' }] }] } };
    await writeFile(settingsPath, JSON.stringify(settings));
    const hookEnv = { ...process.env, CLAUDE_CONFIG_DIR: claudeDirectory };
    await execute(process.execPath, [bin, 'claude-hooks', 'install'], { cwd: directory, env: hookEnv });
    const configured = await readFile(settingsPath, 'utf8');
    const hook = JSON.parse(configured).hooks.Stop.at(-1).hooks[0];
    assert.equal(hook.command, process.execPath);
    assert.deepEqual(hook.args, [await realpath(resolve(installed, 'lib/agent-hook.js')), 'claude-code'], 'Installed hooks must target the shipped lightweight reporter without a shell');
    await execute(hook.command, hook.args, {
      cwd: directory, env: { ...hookEnv, AOW_AGENT_ENDPOINT: '', AOW_AGENT_TOKEN: '' }, timeout: 5000,
    });
    await execute(process.execPath, [bin, 'claude-hooks', 'install'], { cwd: directory, env: hookEnv });
    assert.equal(await readFile(settingsPath, 'utf8'), configured);
    await execute(process.execPath, [bin, 'claude-hooks', 'uninstall'], { cwd: directory, env: hookEnv });
    assert.deepEqual(JSON.parse(await readFile(settingsPath, 'utf8')), settings);
    const piDirectory = resolve(home, '.pi/agent');
    const piEnv = { ...process.env, PI_CODING_AGENT_DIR: piDirectory };
    await execute(process.execPath, [bin, 'pi-extension', 'install'], { cwd: directory, env: piEnv });
    const piPath = resolve(piDirectory, 'extensions/agentonweb.ts');
    const piSource = await readFile(piPath, 'utf8');
    assert.ok(piSource.includes(JSON.stringify(await realpath(resolve(installed, 'lib/pi-extension.js')))));
    const extension = (await import(resolve(installed, 'lib/pi-extension.js'))).default;
    assert.equal(typeof extension, 'function');
    await execute(process.execPath, [bin, 'pi-extension', 'install'], { cwd: directory, env: piEnv });
    assert.equal(await readFile(piPath, 'utf8'), piSource);
    await execute(process.execPath, [bin, 'pi-extension', 'uninstall'], { cwd: directory, env: piEnv });
    await assert.rejects(readFile(piPath), { code: 'ENOENT' });
    // The smoke test does not change service state or user startup files.
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
    console.log('Packed terminal host passed: isolated production install, Claude/Pi integration install/uninstall, lightweight reporters, browser assets and real shell input/output.');
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
