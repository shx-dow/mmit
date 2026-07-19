import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pico from 'picocolors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
export const VERSION = pkg.version as string;

const LOGO = `\
                    █▓ █▓▄
 ██▀██▀▓▄ ██▀██▀▓▄ ▄▄▄ ██
 ██ ██ ██ ██ ██ ██  ██ ▀██▄`;

export function renderHeader(): string {
  const lines = LOGO.split('\n');
  const maxWidth = Math.max(...lines.map(l => l.length));
  const v = pico.dim(`v${VERSION}`);
  return pico.dim(lines.map((l, i) => {
    if (i === 0) return l + ' '.repeat(maxWidth - l.length + 2) + v;
    return l;
  }).join('\n'));
}
