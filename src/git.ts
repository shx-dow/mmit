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

export interface UnstagedStats {
  files: number;
  names: string[];
  diffs: string[];
}

const GIT_OPTS = { encoding: 'utf-8' as const, maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' as const };

export function isGitRepo(): boolean {
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
  if (!diff) {
    return { staged: false, diff: '', truncated: false };
  }

  const estTokens = Math.ceil(diff.length / 4);
  let truncated = false;

  if (estTokens > maxTokens) {
    diff = truncateDiff(diff, maxTokens);
    truncated = true;
  }

  return { staged: true, diff, truncated };
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
  const numstat = git('diff --cached --numstat');
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

export function createCommit(subject: string, body?: string): string {
  const esc = (s: string) => s.replace(/["`$\\]/g, '\\$&');
  const cmd = body
    ? `git commit -m "${esc(subject)}" -m "${esc(body)}"`
    : `git commit -m "${esc(subject)}"`;
  execSync(cmd, {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  return git('rev-parse --short HEAD');
}

export function hasUnstagedChanges(): boolean {
  const status = git('status --porcelain');
  if (!status) return false;
  return status.split('\n').some(line => {
    if (line.startsWith('??')) return true;
    if (line.length >= 2 && line[1] !== ' ') return true;
    return false;
  });
}

export function getUnstagedStats(): UnstagedStats {
  const status = git('status --porcelain');
  if (!status) return { files: 0, names: [], diffs: [] };
  const lines = status.split('\n').filter(line => {
    if (line.startsWith('??')) return true;
    if (line.length >= 2 && line[1] !== ' ') return true;
    return false;
  });
  const names = lines.map(l => l.slice(3));
  const isUntracked = (n: string) => status.split('\n').some(l => l.startsWith('??') && l.slice(3) === n);

  const numstatRaw = git('diff --numstat');
  const numstat: Record<string, { ins: number; del: number }> = {};
  for (const line of numstatRaw.split('\n').filter(Boolean)) {
    const [ins, del, ...fileParts] = line.split('\t');
    const file = fileParts.join('\t');
    numstat[file] = { ins: parseInt(ins, 10) || 0, del: parseInt(del, 10) || 0 };
  }

  const diffs = names.map(n => {
    if (isUntracked(n)) return '(new)';
    const s = numstat[n];
    if (!s) return '';
    return `+${s.ins} -${s.del}`;
  });

  return { files: names.length, names, diffs };
}
