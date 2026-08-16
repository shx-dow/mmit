import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { getCommits, getLastTag, getAllTags } from './history.js';
import type { Commit } from './history.js';
import { renderHeader } from './logo.js';

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

type SectionKey = 'breaking' | 'added' | 'fixed' | 'changed' | 'docs';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEntry(entry: string, scope?: string): string {
  const s = capitalize(entry);
  return scope ? `**${scope}:** ${s}` : s;
}

function groupCommits(commits: Commit[]): Map<SectionKey, { entry: string; bullets: string[] }[]> {
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

function generateCompactMarkdown(commits: Commit[], version: string): string {
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
      const commits = getCommits('--root', to, { verbose, compact });
      if (compact) {
        if (commits.length > 0) sections.push(generateCompactMarkdown(commits, '0.1.0'));
      } else {
        const groups = groupCommits(commits);
        if (groups.size > 0) sections.push(generateMarkdown(groups, '0.1.0'));
      }
    } else {
      for (let i = 0; i < tags.length; i++) {
        const from = i < tags.length - 1 ? tags[i + 1] : '--root';
        const commits = getCommits(from, tags[i], { verbose, compact });
        if (compact) {
          if (commits.length > 0) sections.push(generateCompactMarkdown(commits, tags[i]));
        } else {
          const groups = groupCommits(commits);
          if (groups.size > 0) sections.push(generateMarkdown(groups, tags[i]));
        }
      }
      const lastTag = tags[0];
      const unreleased = getCommits(lastTag, to, { verbose, compact });
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
    const commits = getCommits(from, to, { verbose, compact });
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

export interface ChangelogCliOptions {
  all?: boolean;
  write?: boolean;
  verbose?: boolean;
  compact?: boolean;
  output?: string;
  from?: string;
  to?: string;
}

export async function handleChangelog(opts: ChangelogCliOptions): Promise<void> {
  process.stderr.write(renderHeader() + '\n');

  const result = await generateChangelog({
    all: opts.all,
    verbose: opts.verbose,
    compact: opts.compact,
    write: opts.write,
    output: opts.output,
    from: opts.from,
    to: opts.to,
  });

  if (!result) {
    console.log('No commits found.');
    return;
  }

  if (!opts.write && !opts.output) {
    console.log(result);
  }
}