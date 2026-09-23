import readline from 'node:readline';
import pico from 'picocolors';
import type { CatalogModel } from './models.js';
import { searchModels } from './models.js';

const VISIBLE = 8;
const HIDE = '\x1b[?25l';
const SHOW = '\x1b[?25h';

/**
 * Inline model picker: type to filter, up/down to move, Enter to pick.
 * Returns the model id, the raw query as a custom id when nothing matches,
 * or null on Esc. TTY only, callers fall back to clack otherwise.
 */
export async function pickModelInline(models: CatalogModel[], current: string, providerName: string): Promise<string | null> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  return new Promise((resolve) => {
    let query = '';
    let index = 0;
    let matches = models;
    let renderedLines = 0;
    let done = false;

    const finish = (value: string | null, exitCode?: number) => {
      if (done) return;
      done = true;
      stdin.removeListener('keypress', onKey);
      try {
        if (typeof (stdin as any).setRawMode === 'function') (stdin as any).setRawMode(false);
        stdin.pause();
      } catch { /* noop */ }
      stdout.write(SHOW);
      if (renderedLines > 0) {
        // cursor rests on the query line: drop to block end, then clear all
        readline.moveCursor(stdout, 0, renderedLines - 1);
        readline.cursorTo(stdout, 0);
        readline.moveCursor(stdout, 0, -renderedLines);
        readline.clearScreenDown(stdout);
      }
      if (exitCode !== undefined) process.exit(exitCode);
      resolve(value);
    };

    const refresh = () => {
      matches = searchModels(models, query);
      if (index >= matches.length) index = Math.max(0, matches.length - 1);
    };

    const render = () => {
      const searchPrefix = '│ ';
      const placeholder = query ? '' : pico.dim('search models...');
      const lines: string[] = [];
      lines.push(`${pico.cyan('◆')}  Model for ${providerName}`);
      lines.push(`${pico.dim(searchPrefix)}${query}${placeholder}`);
      const start = Math.max(0, Math.min(index - Math.floor(VISIBLE / 2), Math.max(0, matches.length - VISIBLE)));
      const window = matches.slice(start, start + VISIBLE);
      window.forEach((m, i) => {
        const active = start + i === index;
        const cur = m.id === current ? pico.dim(' (current)') : '';
        const idHint = active ? pico.dim(` (${m.id})`) : '';
        lines.push(active
          ? `${pico.dim(searchPrefix)}${pico.green('●')} ${m.name}${cur}${idHint}`
          : `${pico.dim(searchPrefix)}${pico.dim('○')} ${pico.dim(m.name)}${cur}`);
      });
      if (matches.length === 0) {
        lines.push(pico.dim(`${searchPrefix}No match, Enter uses "${query.trim()}" as custom id`));
      }
      const end = start + window.length;
      const more = matches.length - end > 0 ? ' ↓' : '';
      const above = start > 0 ? '↑ ' : '';
      lines.push(pico.dim(`${searchPrefix}${above}${matches.length} match${matches.length !== 1 ? 'es' : ''}${more}`));

      if (renderedLines > 0) {
        // cursor rests on the search row: drop to block end first, then clear all
        readline.moveCursor(stdout, 0, renderedLines - 1);
        readline.cursorTo(stdout, 0);
        readline.moveCursor(stdout, 0, -renderedLines);
        readline.clearScreenDown(stdout);
      } else {
        readline.cursorTo(stdout, 0);
      }
      stdout.write(lines.join('\n') + '\n');
      // park the (blinking, terminal-controlled) cursor after the query.
      // NOTE: use the NEW count — renderedLines is still the previous frame.
      renderedLines = lines.length;
      readline.moveCursor(stdout, 0, -(renderedLines - 1));
      readline.cursorTo(stdout, searchPrefix.length + query.length);
    };

    const onKey = (str: string | undefined, key: any) => {
      if (key.ctrl && key.name === 'c') {
        stdout.write(SHOW);
        finish(null, 130);
        return;
      }
      if (key.name === 'escape') {
        finish(null);
        return;
      }
      if (key.name === 'return') {
        const pick = matches[index];
        if (pick) finish(pick.id);
        else if (query.trim()) finish(query.trim());
        else finish(null);
        return;
      }
      if (key.name === 'up') {
        if (matches.length > 0) {
          index = index <= 0 ? matches.length - 1 : index - 1;
          render();
        }
        return;
      }
      if (key.name === 'down' || key.name === 'tab') {
        if (matches.length > 0) {
          index = (index + 1) % matches.length;
          render();
        }
        return;
      }
      if (key.name === 'backspace') {
        if (query.length > 0) {
          query = query.slice(0, -1);
          index = 0;
          refresh();
          render();
        }
        return;
      }
      if (str && str.length === 1 && !key.ctrl && !key.meta && key.name !== 'enter' && str.charCodeAt(0) >= 32) {
        query += str;
        index = 0;
        refresh();
        render();
      }
    };

    readline.emitKeypressEvents(stdin);
    try {
      (stdin as any).setRawMode(true);
    } catch {
      finish(null);
      return;
    }
    stdin.resume();
    stdin.on('keypress', onKey);
    refresh();
    render();
  });
}
