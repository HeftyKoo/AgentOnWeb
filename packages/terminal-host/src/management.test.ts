import { afterEach, expect, it, vi } from 'vitest';
import { Maintenance, outsideTerminal } from './management.js';
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it('protects idle live shells, freezes new terminals and serializes maintenance until released', () => {
  const maintenance = new Maintenance();
  expect(() => maintenance.prepare(1, false)).toThrow('active terminal');
  expect(maintenance.active).toBe(false);
  const token = maintenance.prepare(0, false);
  expect(maintenance.active).toBe(true);
  expect(() => maintenance.prepare(0, true)).toThrow('in progress');
  maintenance.release('different-token'); expect(maintenance.active).toBe(true);
  maintenance.release(token); expect(maintenance.active).toBe(false);
});
it('allows explicit force and expires a lease after an interrupted CLI', () => {
  vi.useFakeTimers();
  const maintenance = new Maintenance(); maintenance.prepare(2, true);
  vi.advanceTimersByTime(10 * 60 * 1000); expect(maintenance.active).toBe(false);
});
it('refuses to kill the terminal running the upgrade command itself', () => {
  vi.stubEnv('AOW_AGENT_ENDPOINT', 'http://127.0.0.1:1/agent-event');
  expect(outsideTerminal).toThrow('separate macOS Terminal');
});
