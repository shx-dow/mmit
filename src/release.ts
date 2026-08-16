import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { generateChangelog } from './changelog.js';
import { isGitRepo, git } from './git.js';
import { getLastTag, detectBump } from './history.js';
import { renderHeader } from './logo.js';

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

export interface ReleaseOptions {
  bump?: string;
  dryRun?: boolean;
  noTag?: boolean;
  compact?: boolean;
}

export async function handleRelease(opts: ReleaseOptions): Promise<void> {
  process.stderr.write(renderHeader() + '\n');

  const explicitBump = opts.bump;
  if (explicitBump && !['patch', 'minor', 'major'].includes(explicitBump)) {
    console.error('Usage: mmit release [patch|minor|major] [--dry-run] [--no-tag] [--compact]');
    process.exit(1);
    return;
  }

  const dryRun = !!opts.dryRun;
  const noTag = !!opts.noTag;
  const compact = !!opts.compact;

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
  const bump: 'patch' | 'minor' | 'major' = (explicitBump as 'patch' | 'minor' | 'major') || detectBump(lastTag ?? undefined);
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