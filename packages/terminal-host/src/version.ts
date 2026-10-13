import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
export function installedVersion(): string {
  return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
}
// Capture at process startup: npm can replace package.json while this host lives.
export const VERSION = installedVersion();
