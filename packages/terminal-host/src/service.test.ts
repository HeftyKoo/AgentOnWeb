import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ writeFile: vi.fn(async (..._args: unknown[]) => {}), execFileSync: vi.fn(() => '') }));
vi.mock('node:fs/promises', () => ({ mkdir: async () => {}, writeFile: mocks.writeFile, readFile: vi.fn(), unlink: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }));
import { serviceCommand } from './service.js';
it.skipIf(process.platform !== 'darwin')('updates installed startup paths without restarting existing terminals', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await serviceCommand(['install', '--no-open']);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.writeFile.mock.calls[0]?.[1]).toContain(process.execPath);
    expect(mocks.execFileSync).toHaveBeenCalledExactlyOnceWith('/bin/launchctl', ['print', `gui/${process.getuid!()}/com.agentonweb.terminal`], { stdio: 'ignore' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('next login'));
  } finally { log.mockRestore(); }
});
