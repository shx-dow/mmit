import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { generateCommitMessage } from './engine.js';
import { runComposer } from './composer.js';
import { loadConfig } from './config.js';
import { detectProviderFromEnv } from './provider.js';
import {
  getGitDiff,
  stageAllAndDiff,
  amendCommit,
  getDiffStats,
  isGitRepo,
  hasUnstagedChanges,
  getUnstagedStats,
  getLastCommitDiff,
} from './git.js';
import { renderHeader } from './logo.js';

export async function handleAmend(): Promise<void> {
  process.stderr.write(renderHeader() + '\n');

  const argv = process.argv;
  const dryRun = argv.includes('--dry-run');
  const auto = argv.includes('--auto');

  let providerFlag = '';
  let modelFlag = '';
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '-p' || argv[i] === '--provider') && i + 1 < argv.length) providerFlag = argv[++i];
    if ((argv[i] === '-m' || argv[i] === '--model') && i + 1 < argv.length) modelFlag = argv[++i];
  }

  if (!isGitRepo()) {
    p.intro('');
    p.outro(pico.red('Not a git repository'));
    process.exit(1);
    return;
  }

  // Ensure there's at least one commit to amend
  try {
    execSync('git rev-parse HEAD', { stdio: 'pipe' });
  } catch {
    p.intro('');
    p.outro(pico.red('No commits yet. Nothing to amend.'));
    process.exit(1);
    return;
  }

  p.intro('');

  const provider = providerFlag || loadConfig().provider || detectProviderFromEnv();
  const model = modelFlag;

  // Get the staged diff first
  const diffResult = getGitDiff();
  let diff = diffResult.diff;
  let truncated = diffResult.truncated;

  if (!diff && hasUnstagedChanges()) {
    const shouldStage = await p.confirm({
      message: 'No staged changes. Stage all and amend?',
      initialValue: true,
    });

    if (p.isCancel(shouldStage) || !shouldStage) {
      p.outro('Cancelled.');
      return;
    }

    const result = stageAllAndDiff();
    diff = result.diff;
    truncated = result.truncated;
  }

  // If still no changes, use the last commit's diff for context
  let lastCommitOnly = false;
  if (!diff) {
    diff = getLastCommitDiff();
    if (!diff) {
      p.outro(pico.red('No diff to analyze.'));
      return;
    }
    lastCommitOnly = true;
    p.log.step('No new changes — regenerating message for the last commit.');
  }

  // Show stats if there are staged changes
  let statsLine = '';
  if (!lastCommitOnly) {
    const diffStats = getDiffStats();
    statsLine = `${diffStats.files} file${diffStats.files !== 1 ? 's' : ''} changed`;
    p.log.step(`\`git commit --amend\`  ${pico.dim(statsLine)}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)}`);
  } else {
    p.log.step('`git commit --amend`  (message only)');
  }

  // Detect if we need a provider setup
  if (!provider) {
    p.log.warn('No API key found.');
    const runInit = await p.confirm({
      message: 'Run `mmit init` to set one up?',
      initialValue: true,
    });

    if (p.isCancel(runInit) || !runInit) {
      p.outro('Cancelled.');
      return;
    }

    // Import and call handleInit — but it's in index.ts, so we need a different approach
    // Let user run mmit init manually
    p.outro(pico.dim('Run `mmit init` to configure your provider.'));
    return;
  }

  const spin = p.spinner();
  spin.start('Generating commit message...');

  let msg: Awaited<ReturnType<typeof generateCommitMessage>>;

  try {
    msg = await generateCommitMessage(diff, truncated, provider, model);
  } catch (err: unknown) {
    spin.stop('Error');
    const message = err instanceof Error ? err.message : String(err);
    p.outro(pico.red(`Generation failed: ${message}`));
    process.exit(1);
    return;
  }

  spin.stop('Done');

  const statsNote = lastCommitOnly ? '' : `  (${statsLine}, ${pico.green(`+${getDiffStats().insertions}`)} ${pico.red(`-${getDiffStats().deletions}`)})`;

  await runComposer({
    message: msg,
    verb: 'Amend',
    verbPast: 'Amended',
    dryRunNote: 'not amending.',
    statsNote,
    dryRun,
    auto: !!(auto || loadConfig().autoConfirm),
    regenerate: () => generateCommitMessage(diff, truncated, provider, model),
    commit: amendCommit,
  });
}
