import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, delimiter, join, resolve } from 'node:path';

export async function executablePath(command: string): Promise<string> {
  const candidates = command.includes('/') ? [resolve(command)] : (process.env.PATH ?? '').split(delimiter).map(p => join(p, command));
  for (const path of candidates) { try { await access(path, constants.X_OK); return await realpath(path); } catch {} }
  throw new Error(`Executable not found: ${command}`);
}

/** The real interactive shell owns cd, startup files, aliases and PATH. */
export function shellLaunch(env: NodeJS.ProcessEnv = process.env, platform = process.platform): { command: string; args: string[] } {
  const command = env.SHELL || (platform === 'win32' ? env.ComSpec || 'cmd.exe' : platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const name = basename(command).toLowerCase();
  if (platform === 'win32') return { command, args: name.startsWith('powershell') || name.startsWith('pwsh') ? ['-NoLogo'] : [] };
  return { command, args: ['zsh', 'bash', 'fish', 'sh', 'ksh'].includes(name) ? ['-l', '-i'] : ['-i'] };
}
