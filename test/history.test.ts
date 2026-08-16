import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSubject, extractBullets, getCommits, detectBump } from '../src/history.js';

const ORIGINAL_CWD = process.cwd();
const dirs: string[] = [];

function withRepo() {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'mmit-history-'));
    dirs.push(dir);
    process.chdir(dir);
    execSync('git init -q', { stdio: 'ignore' });
    execSync('git config user.email test@test', { stdio: 'ignore' });
    execSync('git config user.name test', { stdio: 'ignore' });
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
}

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(message: string, file: string): void {
  writeFileSync(file, `${message}\n`, { flag: 'a' });
  git('add -A');
  git(`commit -q -m "${message.replace(/"/g, '\\"')}"`);
}

describe('parseSubject', () => {
  it('parses type, scope, and description', () => {
    expect(parseSubject('feat(api): add auth endpoint')).toEqual({
      type: 'feat', scope: 'api', breaking: false, description: 'add auth endpoint',
    });
  });

  it('parses without a scope', () => {
    const parsed = parseSubject('docs: fix typos');
    expect(parsed?.type).toBe('docs');
    expect(parsed?.scope).toBeUndefined();
  });

  it('detects a breaking-change bang', () => {
    expect(parseSubject('feat(api)!: remove /v2')?.breaking).toBe(true);
  });

  it('rejects non-conventional subjects', () => {
    expect(parseSubject('just some message')).toBeNull();
  });
});

describe('extractBullets', () => {
  it('extracts hyphen and asterisk bullets', () => {
    expect(extractBullets('- first\n- second\nplain line\n* third')).toEqual(['first', 'second', 'third']);
  });

  it('returns nothing for an empty body', () => {
    expect(extractBullets('')).toEqual([]);
  });
});

describe('git history reading', () => {
  withRepo();

  it('filters maintenance types by default but not with includeAll', () => {
    commit('feat(api): add endpoint', 'a.txt');
    commit('chore: housekeeping', 'b.txt');

    const filtered = getCommits('--root', 'HEAD');
    expect(filtered.map(c => c.type)).toEqual(['feat']);

    const all = getCommits('--root', 'HEAD', { includeAll: true });
    expect(all.map(c => c.type)).toEqual(['chore', 'feat']);
  });

  it('flags breaking changes from the body footer', () => {
    git('commit -q --allow-empty -m "fix(api): drop endpoint" -m "BREAKING CHANGE: removed"');
    const commits = getCommits('--root', 'HEAD');
    expect(commits[0].breaking).toBe(true);
  });
});

describe('detectBump', () => {
  withRepo();

  it('returns patch for fixes only', () => {
    commit('fix(api): handle null', 'a.txt');
    expect(detectBump()).toBe('patch');
  });

  it('returns minor for a feat', () => {
    commit('feat(api): add endpoint', 'a.txt');
    expect(detectBump()).toBe('minor');
  });

  it('returns major for a breaking change', () => {
    commit('feat(api)!: remove endpoint', 'a.txt');
    expect(detectBump()).toBe('major');
  });
});