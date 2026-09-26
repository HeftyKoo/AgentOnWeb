import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { encodeNativeMessage, extensionOrigin, installNativeBridge, uninstallNativeBridge, nativeRequest, readNativeMessage, STORE_EXTENSION_ID } from './native-bridge.js';

it('continues removing other native bridge files after one removal fails', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aow-native-cleanup-'));
  try {
    await installNativeBridge('/test/cli.js', [], home);
    const manifest = join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentonweb.terminal.json');
    await rm(manifest); await mkdir(manifest);
    await expect(uninstallNativeBridge(home)).rejects.toBeInstanceOf(AggregateError);
    for (const path of [
      join(home, 'Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/com.agentonweb.terminal.json'),
      join(home, '.agentonweb/terminal/native-host'), join(home, '.agentonweb/terminal/native-origins.json'),
    ]) await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(home, { recursive: true, force: true }); }
});

it('decodes fragmented native frames and rejects oversized or truncated input', async () => {
  async function* chunks(data: Buffer) { for (const byte of data) yield Buffer.from([byte]); }
  expect(await readNativeMessage(chunks(encodeNativeMessage({ type: 'probe', label: '中文' })))).toEqual({ type: 'probe', label: '中文' });
  const bad = Buffer.alloc(4); bad.writeUInt32LE(4097);
  await expect(readNativeMessage(chunks(bad))).rejects.toThrow('size');
  await expect(readNativeMessage(chunks(Buffer.from([2, 0, 0])))).rejects.toThrow('Incomplete');
});
it('registers only explicit extension origins with executable absolute paths and supports repeat setup', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aow-native-'));
  try {
    const id = 'a'.repeat(32);
    await installNativeBridge("/tmp/a b'c/lib/cli.js", [id], home);
    await installNativeBridge("/tmp/a b'c/lib/cli.js", [id], home);
    const manifest = JSON.parse(await readFile(join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentonweb.terminal.json'), 'utf8'));
    expect(JSON.parse(await readFile(join(home, 'Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/com.agentonweb.terminal.json'), 'utf8')).allowed_origins).toEqual(manifest.allowed_origins);
    expect(manifest.allowed_origins).toEqual([extensionOrigin(STORE_EXTENSION_ID) + '/', extensionOrigin(id) + '/']);
    expect((await stat(manifest.path)).mode & 0o777).toBe(0o700);
    expect(await readFile(manifest.path, 'utf8')).toContain("'\\''");
    await expect(nativeRequest(join(home, '.agentonweb/terminal'), 'chrome-extension://' + 'b'.repeat(32), { type: 'probe' })).rejects.toThrow('not allowed');
    expect(() => extensionOrigin('*')).toThrow();
    await uninstallNativeBridge(home);
    await uninstallNativeBridge(home);
    await expect(stat(manifest.path)).rejects.toMatchObject({ code: 'ENOENT' });
    for (const name of ['Chrome', 'Chrome for Testing']) await expect(stat(join(home, 'Library/Application Support/Google', name, 'NativeMessagingHosts/com.agentonweb.terminal.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(home, { recursive: true, force: true }); }
});
