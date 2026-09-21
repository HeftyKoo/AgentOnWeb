import { expect, it } from 'vitest';
import { shellLaunch } from './launch.js';
import { launchAgent } from './service.js';

it('starts the real login shell with interactive startup files', () => {
  expect(shellLaunch({ SHELL: '/bin/zsh' }, 'darwin')).toEqual({ command: '/bin/zsh', args: ['-l', '-i'] });
  expect(shellLaunch({ SHELL: '/usr/local/bin/fish' }, 'linux')).toEqual({ command: '/usr/local/bin/fish', args: ['-l', '-i'] });
  expect(shellLaunch({}, 'win32')).toEqual({ command: 'cmd.exe', args: [] });
});
it('quotes launch agent paths as XML data, with no shell command interpolation', () => {
  const plist = launchAgent('/node', '/a & b/cli.js', '/home/test', '/bin:/a&b', '/bin/zsh');
  expect(plist).toContain('<string>/a &amp; b/cli.js</string>');
  expect(plist).toContain('<string>terminal</string><string>--service</string>');
  expect(plist).toContain('<key>RunAtLoad</key><true/>');
});
