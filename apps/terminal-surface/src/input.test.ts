import { expect, it } from 'vitest';
import { splitInput } from './input.js';
it('streams a large Unicode bracketed paste without loss or oversized JSON frames', () => {
  const data = '\x1b[200~' + ('hello 世界 👋\u0000'.repeat(20000)) + '\x1b[201~';
  const chunks = [...splitInput(data)];
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.join('')).toBe(data);
  for (const chunk of chunks) {
    expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/u);
    expect(Buffer.byteLength(JSON.stringify({ type: 'input', data: chunk, epoch: 'epoch', lease: 1 }))).toBeLessThan(100000);
  }
});
