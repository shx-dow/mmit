import { execSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

export interface ChangelogOptions {
  all?: boolean;
  verbose?: boolean;
  compact?: boolean;
  write?: boolean;
  output?: string;
  from?: string;
  to?: string;
  version?: string;
}

interface CommitInfo {
  hash: string;
  subject: string;
  type: string;
  scope?: string;
  breaking: boolean;
  entry: string;
  bullets: string[];
}

type SectionKey = 'breaking' | 'added' | 'fixed' | 'changed' | 'docs';

const GIT_OPTS = { encoding: 'utf-8' as const, maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' as const };

function git(args: string): string {
  try {
    return execSync(`git ${args}`, GIT_OPTS).trim();
  } catch {
    return '';
  }
}

function getLastTag(): string | null {
  const tag = git('describe --tags --abbrev=0 2>/dev/null');
  return tag || null;
}

function getAllTags(): string[] {
  const tags = git('tag --sort=-v:refname');
  return tags ? tags.split('\n').filter(Boolean) : [];
}

const COMMIT_PARSE = /^([a-zA-Z]+)(\([a-zA-Z0-9_.\-,/]+\))?!?:\s(.+)/;

function parseSubject(subject: string): { type: string; scope?: string; breaking: boolean; description: string } | null {
  const m = subject.match(COMMIT_PARSE);
  if (!m) return null;
  const type = m[1];
  const scope = m[2] ? m[2].slice(1, -1) : undefined;
  const full = m[0];
  const breaking = full.includes('!');
  const description = m[3];
  return { type, scope, breaking, description };
}

const BREAKING_FOOTER = /^BREAKING[-\s]CHANGE:/m;

function extractBullets(body: string): string[] {
  if (!body) return [];
  return body.split('\n')
    .map(l => l.trim())
    .filter(l => /^[-*]\s/.test(l))
    .map(l => l.replace(/^[-*]\s*/, ''))
    .filter(Boolean);
}

function getCommits(from: string, to: string = 'HEAD', verbose: boolean = false, compact?: boolean): CommitInfo[] {
  const range = from === '--root' ? to : `${from}..${to}`;
  const hashFmt = compact ? '%h' : '%H';
  const raw = git(`log --format="<<<COMMIT>>>%n${hashFmt}%n%s%n%b" ${range}`);
  if (!raw) return [];

  const blocks = raw.split('<<<COMMIT>>>\n').filter(Boolean);
  const commits: CommitInfo[] = [];

  const skipTypes = (compact || verbose) ? new Set<string>() : new Set(['chore', 'ci', 'build', 'test', 'style']);

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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEntry(entry: string, scope?: string): string {
  const s = capitalize(entry);
  return scope ? `**${scope}:** ${s}` : s;
}

function groupCommits(commits: CommitInfo[]): Map<SectionKey, { entry: string; bullets: string[] }[]> {
  const groups = new Map<SectionKey, { entry: string; bullets: string[] }[]>();

  for (const c of commits) {
    const item = { entry: formatEntry(c.entry, c.scope), bullets: c.bullets };

    if (c.breaking) {
      const items = groups.get('breaking') || [];
      items.push(item);
      groups.set('breaking', items);
      continue;
    }

    let section: SectionKey;
    switch (c.type) {
      case 'feat': section = 'added'; break;
      case 'fix': section = 'fixed'; break;
      case 'refactor':
      case 'perf':
      case 'chore':
      case 'ci':
      case 'build':
      case 'test':
      case 'style': section = 'changed'; break;
      case 'docs': section = 'docs'; break;
      default: continue;
    }

    const items = groups.get(section) || [];
    items.push(item);
    groups.set(section, items);
  }

  return groups;
}

const SECTION_ORDER: SectionKey[] = ['breaking', 'added', 'fixed', 'changed', 'docs'];

const SECTION_LABELS: Record<SectionKey, string> = {
  breaking: 'Breaking Changes',
  added: 'Added',
  fixed: 'Fixed',
  changed: 'Changed',
  docs: 'Documentation',
};

function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateMarkdown(groups: Map<SectionKey, { entry: string; bullets: string[] }[]>, version: string): string {
  const date = formatDate();
  const lines: string[] = [];

  lines.push(`## ${version} (${date})`);
  lines.push('');

  for (const key of SECTION_ORDER) {
    const items = groups.get(key);
    if (!items || items.length === 0) continue;
    lines.push(`### ${SECTION_LABELS[key]}`);
    lines.push('');
    for (const item of items) {
      lines.push(`- ${item.entry}`);
      for (const bullet of item.bullets) {
        lines.push(`  - ${bullet}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function generateCompactMarkdown(commits: CommitInfo[], version: string): string {
  const date = formatDate();
  const lines: string[] = [];

  lines.push(`## ${version} (${date})`);
  lines.push('');
  for (const c of commits) {
    lines.push(`${c.hash} ${c.subject}`);
  }
  lines.push('');

  return lines.join('\n');
}

export async function generateChangelog(options: ChangelogOptions): Promise<string> {
  const to = options.to || 'HEAD';
  const verbose = options.verbose || false;
  const compact = options.compact || false;
  let sections: string[] = [];

  if (options.all) {
    const tags = getAllTags();
    if (tags.length === 0) {
      const commits = getCommits('--root', to, verbose, compact);
      if (compact) {
        if (commits.length > 0) sections.push(generateCompactMarkdown(commits, '0.1.0'));
      } else {
        const groups = groupCommits(commits);
        if (groups.size > 0) sections.push(generateMarkdown(groups, '0.1.0'));
      }
    } else {
      for (let i = 0; i < tags.length; i++) {
        const from = i < tags.length - 1 ? tags[i + 1] : '--root';
        const commits = getCommits(from, tags[i], verbose, compact);
        if (compact) {
          if (commits.length > 0) sections.push(generateCompactMarkdown(commits, tags[i]));
        } else {
          const groups = groupCommits(commits);
          if (groups.size > 0) sections.push(generateMarkdown(groups, tags[i]));
        }
      }
      const lastTag = tags[0];
      const unreleased = getCommits(lastTag, to, verbose, compact);
      if (unreleased.length > 0) {
        if (compact) {
          sections.splice(0, 0, generateCompactMarkdown(unreleased, 'Unreleased'));
        } else {
          const groups = groupCommits(unreleased);
          sections.splice(0, 0, generateMarkdown(groups, 'Unreleased'));
        }
      }
    }
  } else {
    const from = options.from || getLastTag() || '--root';
    const commits = getCommits(from, to, verbose, compact);
    if (commits.length === 0) return '';

    const versionLabel = options.version || (from === '--root' ? '0.1.0' : 'Unreleased');
    if (compact) {
      sections.push(generateCompactMarkdown(commits, versionLabel));
    } else {
      const groups = groupCommits(commits);
      sections.push(generateMarkdown(groups, versionLabel));
    }
  }

  const result = sections.join('\n');

  if (options.write || options.output) {
    const filePath = options.output || 'CHANGELOG.md';
    const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    writeFileSync(filePath, result + existing);
  }

  return result;
}
