import { execFileSync } from 'node:child_process';

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

export class GitError extends Error {
  constructor(
    public args: string[],
    message: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export function isGitRepo(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/** Run git with argv (no shell). Throws GitError on failure. Returns trimmed stdout (may be ''). */
export function git(args: string[]): string {
  try {
    return execFileSync('git', args, GIT_OPTS).trim();
  } catch (err: unknown) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr).trim() : '';
    const message = stderr || (err instanceof Error ? err.message : String(err));
    throw new GitError(args, `git ${args.join(' ')} failed: ${message}`);
  }
}

/** Best-effort git: returns '' when git fails (missing ref, no tags, etc.). */
export function gitOptional(args: string[]): string {
  try {
    return git(args);
  } catch {
    return '';
  }
}

export function getGitDiff(maxTokens: number = 8000): DiffResult {
  if (!isGitRepo()) {
    return { staged: false, diff: '', truncated: false };
  }

  let diff = gitOptional(['diff', '--cached']);
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
  git(['add', '-A']);
  return getGitDiff();
}

function parseCount(value: string | undefined): number | null {
  if (!value || value === '-') return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

export function getDiffStats(): DiffStats {
  const numstat = gitOptional(['diff', '--cached', '--numstat']);
  if (!numstat) return { files: 0, insertions: 0, deletions: 0 };

  const lines = numstat.split('\n').filter(Boolean);
  let files = 0, insertions = 0, deletions = 0;
  for (const line of lines) {
    const [add, del] = line.split('\t');
    const ins = parseCount(add);
    const delCount = parseCount(del);
    if (ins !== null) insertions += ins;
    if (delCount !== null) deletions += delCount;
    files++;
  }
  return { files, insertions, deletions };
}

export function amendCommit(subject: string, body?: string): string {
  const args = body
    ? ['commit', '--amend', '-m', subject, '-m', body]
    : ['commit', '--amend', '-m', subject];
  execFileSync('git', args, {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  return git(['rev-parse', '--short', 'HEAD']);
}

export function getLastCommitDiff(): string {
  return gitOptional(['diff', 'HEAD~1..HEAD']);
}

export function createCommit(subject: string, body?: string): string {
  const args = body ? ['commit', '-m', subject, '-m', body] : ['commit', '-m', subject];
  execFileSync('git', args, {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  return git(['rev-parse', '--short', 'HEAD']);
}

export function hasUnstagedChanges(): boolean {
  const status = gitOptional(['status', '--porcelain']);
  if (!status) return false;
  return status.split('\n').some(line => {
    if (line.startsWith('??')) return true;
    if (line.length >= 2 && line[1] !== ' ') return true;
    return false;
  });
}

export function getUnstagedStats(): UnstagedStats {
  const status = gitOptional(['status', '--porcelain']);
  if (!status) return { files: 0, names: [], diffs: [] };
  const lines = status.split('\n').filter(line => {
    if (line.startsWith('??')) return true;
    if (line.length >= 2 && line[1] !== ' ') return true;
    return false;
  });
  const names = lines.map(l => l.slice(3));
  const isUntracked = (n: string) => status.split('\n').some(l => l.startsWith('??') && l.slice(3) === n);

  const numstatRaw = gitOptional(['diff', '--numstat']);
  const numstat: Record<string, { ins: number; del: number }> = {};
  for (const line of numstatRaw.split('\n').filter(Boolean)) {
    const [ins, del, ...fileParts] = line.split('\t');
    const file = fileParts.join('\t');
    numstat[file] = { ins: parseCount(ins) ?? 0, del: parseCount(del) ?? 0 };
  }

  const diffs = names.map(n => {
    if (isUntracked(n)) return '(new)';
    const s = numstat[n];
    if (!s) return '';
    return `+${s.ins} -${s.del}`;
  });

  return { files: names.length, names, diffs };
}
