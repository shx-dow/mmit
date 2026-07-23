import { execSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { generateChangelog } from './changelog.js';
import { isGitRepo } from './git.js';
import { renderHeader } from './logo.js';

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

const COMMIT_PARSE = /^([a-zA-Z]+)(\([a-zA-Z0-9_.\-,/]+\))?!?:\s(.+)/;
const BREAKING_FOOTER = /^BREAKING[-\s]CHANGE:/m;

function detectBump(lastTag: string | null): 'patch' | 'minor' | 'major' {
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const raw = git(`log --format="%s###BODY###%b###END###" ${range}`);
  if (!raw) return 'patch';

  const blocks = raw.split('###END###\n').filter(Boolean);
  let hasFeat = false;

  for (const block of blocks) {
    const [subjectLine, ...rest] = block.split('###BODY###');
    const subject = subjectLine.trim();
    const body = rest.join('###BODY###').trim();

    const m = subject.match(COMMIT_PARSE);
    if (!m) continue;

    const full = m[0];
    const type = m[1];

    if (full.includes('!') || BREAKING_FOOTER.test(body)) return 'major';
    if (type === 'feat') hasFeat = true;
  }

  return hasFeat ? 'minor' : 'patch';
}

function bumpVersion(version: string, bump: 'patch' | 'minor' | 'major'): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version: ${version}`);
  }
  switch (bump) {
    case 'patch': return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    case 'minor': return `${parts[0]}.${parts[1] + 1}.0`;
    case 'major': return `${parts[0] + 1}.0.0`;
  }
}

export async function handleRelease(): Promise<void> {
  process.stderr.write(renderHeader() + '\n');

  const argv = process.argv;
  const bumpArg = argv[argv.indexOf('release') + 1];
  const explicitBump = bumpArg && !bumpArg.startsWith('-') ? bumpArg : undefined;

  if (explicitBump && !['patch', 'minor', 'major'].includes(explicitBump)) {
    console.error('Usage: mmit release [patch|minor|major] [--dry-run] [--no-tag] [--compact]');
    process.exit(1);
    return;
  }

  const dryRun = argv.includes('--dry-run');
  const noTag = argv.includes('--no-tag');
  const compact = argv.includes('--compact');

  if (!isGitRepo()) {
    p.outro(pico.red('Not a git repository'));
    process.exit(1);
    return;
  }

  if (!dryRun) {
    const status = git('status --porcelain');
    if (status) {
      p.outro(pico.red('Working directory is not clean. Commit or stash changes first.'));
      process.exit(1);
      return;
    }
  }

  const pkgPath = process.cwd() + '/package.json';
  if (!existsSync(pkgPath)) {
    p.outro(pico.red('No package.json found in current directory'));
    process.exit(1);
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const currentVersion = pkg.version as string;

  if (!currentVersion) {
    p.outro(pico.red('No version field in package.json'));
    process.exit(1);
    return;
  }

  const lastTag = getLastTag();
  const bump: 'patch' | 'minor' | 'major' = explicitBump as any || detectBump(lastTag);
  const newVersion = bumpVersion(currentVersion, bump);

  p.log.step(`Release: ${pico.dim(currentVersion)} ${pico.dim('→')} ${pico.green(`v${newVersion}`)} ${pico.dim(`(${bump})`)}`);

  const changelog = await generateChangelog({
    from: lastTag || undefined,
    to: 'HEAD',
    version: `v${newVersion}`,
    verbose: true,
    compact,
  });

  if (!changelog) {
    p.outro(pico.red('No commits to release'));
    process.exit(1);
    return;
  }

  p.log.message(changelog);

  if (dryRun) {
    p.log.step(`${pico.dim('git add -A')}`);
    p.log.step(`${pico.dim(`git commit -m "chore(release): v${newVersion}"`)}`);
    if (!noTag) p.log.step(`${pico.dim(`git tag v${newVersion}`)}`);
    p.outro(pico.green('Dry-run — no changes made'));
    return;
  }

  const confirm = await p.confirm({
    message: `Release v${newVersion}?`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.outro('Cancelled.');
    return;
  }

  p.log.step('Writing changelog...');
  const changelogPath = process.cwd() + '/CHANGELOG.md';
  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf-8') : '';
  writeFileSync(changelogPath, changelog + '\n' + existing);

  p.log.step('Bumping version...');
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  p.log.step('Committing...');
  git('add -A');
  git(`commit -m "chore(release): v${newVersion}"`);

  const hash = git('rev-parse --short HEAD');
  if (!hash) {
    p.outro(pico.red('Commit failed'));
    process.exit(1);
    return;
  }

  if (!noTag) {
    p.log.step('Tagging...');
    git(`tag v${newVersion}`);
  }

  p.outro(pico.green(`Released v${newVersion}  (${hash})${noTag ? '' : ' · tagged'} `));
}
