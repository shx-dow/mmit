import pico from 'picocolors';

const LOGO = `\
                    █▓ █▓▄
 ██▀██▀▓▄ ██▀██▀▓▄ ▄▄▄ ██
 ██ ██ ██ ██ ██ ██  ██ ▀██▄`;

export const VERSION = '0.1.0';

export function renderHeader(): string {
  const lines = LOGO.split('\n');
  const maxWidth = Math.max(...lines.map(l => l.length));
  const v = pico.dim(`v${VERSION}`);
  return pico.dim(lines.map((l, i) => {
    if (i === 0) return l + ' '.repeat(maxWidth - l.length + 2) + v;
    return l;
  }).join('\n'));
}
