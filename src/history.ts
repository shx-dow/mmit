import { gitOptional } from './git.js';

export interface Commit {
  hash: string;
  subject: string;
  type: string;
  scope?: string;
  breaking: boolean;
  entry: string;
  bullets: string[];
}

export interface CommitQuery {
  verbose?: boolean;
  compact?: boolean;
  includeAll?: boolean;
}

const COMMIT_PARSE = /^([a-zA-Z]+)(\([a-zA-Z0-9_.\-,/]+\))?!?:\s(.+)/;
const BREAKING_FOOTER = /^BREAKING[-\s]CHANGE:/m;

export function parseSubject(subject: string): { type: string; scope?: string; breaking: boolean; description: string } | null {
  const m = subject.match(COMMIT_PARSE);
  if (!m) return null;
  const type = m[1];
  const scope = m[2] ? m[2].slice(1, -1) : undefined;
  const breaking = /^[a-zA-Z]+(\([^)]*\))?!:/.test(subject);
  const description = m[3];
  return { type, scope, breaking, description };
}

export function extractBullets(body: string): string[] {
  if (!body) return [];
  return body.split('\n')
    .map(l => l.trim())
    .filter(l => /^[-*]\s/.test(l))
    .map(l => l.replace(/^[-*]\s*/, ''))
    .filter(Boolean);
}

export function getLastTag(): string | null {
  const tag = gitOptional(['describe', '--tags', '--abbrev=0']);
  return tag || null;
}

export function getAllTags(): string[] {
  const tags = gitOptional(['tag', '--sort=-v:refname']);
  return tags ? tags.split('\n').filter(Boolean) : [];
}

const REF_PATTERN = /^[A-Za-z0-9._\/-]+$/;

function assertRef(value: string, label: string): void {
  if (!REF_PATTERN.test(value)) {
    throw new Error(`Unsafe ${label} ref: ${JSON.stringify(value)}`);
  }
}

export function getCommits(from: string, to: string = 'HEAD', opts: CommitQuery = {}): Commit[] {
  assertRef(to, 'to');
  let range: string;
  if (!from || from === '--root') {
    range = to;
  } else {
    assertRef(from, 'from');
    range = `${from}..${to}`;
  }
  const hashFmt = opts.compact ? '%h' : '%H';
  const raw = gitOptional(['log', `--format=<<<COMMIT>>>%n${hashFmt}%n%s%n%b`, range]);
  if (!raw) return [];

  const blocks = raw.split('<<<COMMIT>>>\n').filter(Boolean);
  const commits: Commit[] = [];

  const skipTypes = opts.includeAll
    ? new Set<string>()
    : (opts.compact || opts.verbose) ? new Set<string>() : new Set(['chore', 'ci', 'build', 'test', 'style']);

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    const hash = lines[0].trim();
    const subject = lines[1].trim();
    const body = lines.slice(2).join('\n').trim();

    const parsed = parseSubject(subject);
    if (!parsed) continue;

    if (skipTypes.has(parsed.type)) continue;

    const breaking = parsed.breaking || BREAKING_FOOTER.test(body);
    const scope = parsed.scope?.replace(/^\(|\)$/g, '');
    const entry = parsed.description;
    const bullets = extractBullets(body);

    commits.push({
      hash,
      subject,
      type: parsed.type,
      scope,
      breaking,
      entry,
      bullets,
    });
  }

  return commits;
}

export function detectBump(from?: string, to: string = 'HEAD'): 'patch' | 'minor' | 'major' {
  const commits = getCommits(from ?? '--root', to, { includeAll: true });
  let hasFeat = false;

  for (const c of commits) {
    if (c.breaking) return 'major';
    if (c.type === 'feat') hasFeat = true;
  }

  return hasFeat ? 'minor' : 'patch';
}