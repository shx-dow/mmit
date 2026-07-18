import { execSync } from 'node:child_process';

export interface DiffResult {
  staged: boolean;
  diff: string;
  truncated: boolean;
}

export interface DiffStats {
  files: number;
  insertions: number;
  deletions: number;
}

const GIT_OPTS = { encoding: 'utf-8' as const, maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' as const };

function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

function git(args: string): string {
  try {
    return execSync(`git ${args}`, GIT_OPTS).trim();
  } catch {
    return '';
  }
}

export function getGitDiff(maxTokens: number = 8000): DiffResult {
  if (!isGitRepo()) {
    return { staged: false, diff: '', truncated: false };
  }

  let diff = git('diff --cached');
  let staged = !!diff;

  if (!diff) {
    diff = git('diff HEAD');
  }

  if (!diff) {
    diff = git('diff');
  }

  if (!diff) {
    return { staged: false, diff: '', truncated: false };
  }

  const estTokens = Math.ceil(diff.length / 4);
  let truncated = false;

  if (estTokens > maxTokens) {
    diff = truncateDiff(diff, maxTokens);
    truncated = true;
  }

  return { staged, diff, truncated };
}

function truncateDiff(diff: string, maxTokens: number): string {
  const chars = maxTokens * 4;
  const lines = diff.split('\n');

  const kept: string[] = [];
  let length = 0;

  for (const line of lines) {
    const next = length + line.length + 1;
    if (next > chars) break;
    kept.push(line);
    length = next;
  }

  kept.push('# ... diff truncated due to size ...');
  return kept.join('\n');
}

export function stageAllAndDiff(): DiffResult {
  git('add -A');
  return getGitDiff();
}

export function getDiffStats(): DiffStats {
  const staged = !!git('diff --cached --stat');
  const numstat = staged ? git('diff --cached --numstat') : git('diff HEAD --numstat') || git('diff --numstat');
  if (!numstat) return { files: 0, insertions: 0, deletions: 0 };

  const lines = numstat.split('\n').filter(Boolean);
  let files = 0, insertions = 0, deletions = 0;
  for (const line of lines) {
    const [add, del] = line.split('\t');
    if (add && add !== '-') insertions += parseInt(add, 10);
    if (del && del !== '-') deletions += parseInt(del, 10);
    files++;
  }
  return { files, insertions, deletions };
}

export function createCommit(message: string): string {
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  return git('rev-parse --short HEAD');
}
