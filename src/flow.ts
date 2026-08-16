import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig } from './config.js';
import { detectProviderFromEnv } from './provider.js';
import { generateCommitMessage } from './engine.js';
import type { GeneratedMessage } from './engine.js';
import { runComposer } from './composer.js';
import {
  getGitDiff,
  stageAllAndDiff,
  getDiffStats,
  isGitRepo,
  hasUnstagedChanges,
  getUnstagedStats,
  getLastCommitDiff,
} from './git.js';
import { renderHeader } from './logo.js';
import { handleInit } from './init.js';

export interface FlowOptions {
  verb: string;
  verbPast: string;
  dryRunNote: string;
  actionLabel: string;
  commit: (subject: string, body?: string) => string;
  provider?: string;
  model?: string;
  dryRun: boolean;
  auto: boolean;
  fallbackToLastCommit?: boolean;
  warnUnstaged?: boolean;
  runInitOnMissingProvider?: boolean;
}

export async function runFlow(opts: FlowOptions): Promise<void> {
  process.stderr.write(renderHeader() + '\n');
  p.intro('');

  if (!isGitRepo()) {
    p.outro(pico.red('Not a git repository'));
    process.exit(1);
    return;
  }

  const provider = opts.provider || loadConfig().provider || detectProviderFromEnv();
  const model = opts.model;

  const diffResult = getGitDiff(loadConfig().maxDiffTokens ?? 8000);
  let diff = diffResult.diff;
  let staged = diffResult.staged;
  let truncated = diffResult.truncated;

  if (!diff) {
    const promptStage = opts.fallbackToLastCommit ? hasUnstagedChanges() : true;
    if (promptStage) {
      const shouldStage = await p.confirm({
        message: `No staged changes. Stage all and ${opts.verb.toLowerCase()}?`,
        initialValue: true,
      });

      if (p.isCancel(shouldStage) || !shouldStage) {
        p.outro('Cancelled.');
        return;
      }

      const result = stageAllAndDiff();
      diff = result.diff;
      staged = result.staged;
      truncated = result.truncated;
    }
  }

  let lastCommitOnly = false;
  if (!diff && opts.fallbackToLastCommit) {
    diff = getLastCommitDiff();
    if (!diff) {
      p.outro(pico.red('No diff to analyze.'));
      return;
    }
    lastCommitOnly = true;
    p.log.step('No new changes — regenerating message for the last commit.');
  }

  if (!diff) {
    p.outro(pico.red('No diff to commit.'));
    return;
  }

  if (opts.warnUnstaged && staged && hasUnstagedChanges()) {
    const unstaged = getUnstagedStats();
    const files = unstaged.files;
    const what = `file${files !== 1 ? 's' : ''}`;
    p.log.warn(`${files} untracked or modified ${what} are not staged`);
    p.log.message(unstaged.names.map((n, i) => {
      const dim = pico.dim;
      const stat = unstaged.diffs[i];
      const statStr = stat ? dim(` ${stat}`) : '';
      return `  ${n}${statStr}`;
    }).join('\n'));
    const action = await p.select({
      message: 'What do you want to do?',
      options: [
        { value: 'stage', label: 'Stage all and proceed', hint: 'git add -A' },
        { value: 'staged', label: 'Commit staged only', hint: 'ignore unstaged changes' },
        { value: 'cancel', label: 'Cancel' },
      ],
    });

    if (p.isCancel(action) || action === 'cancel') {
      p.outro('Cancelled.');
      return;
    }

    if (action === 'stage') {
      const result = stageAllAndDiff();
      diff = result.diff;
      staged = result.staged;

      if (!diff) {
        p.outro(pico.red('No diff to commit.'));
        return;
      }
    }
  }

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

    if (opts.runInitOnMissingProvider) {
      await handleInit();
    } else {
      p.outro(pico.dim('Run `mmit init` to configure your provider.'));
    }
    return;
  }

  let statsLine = '';
  let diffStats: { files: number; insertions: number; deletions: number } | null = null;
  if (lastCommitOnly) {
    p.log.step(`${opts.actionLabel}(message only)`);
  } else {
    diffStats = getDiffStats();
    statsLine = `${diffStats.files} file${diffStats.files !== 1 ? 's' : ''} changed`;
    p.log.step(`${opts.actionLabel}${pico.dim(statsLine)}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)}`);
  }

  const spin = p.spinner();
  spin.start('Generating commit message...');

  let msg: GeneratedMessage;

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

  const statsNote = lastCommitOnly
    ? ''
    : `  (${statsLine}, ${pico.green(`+${diffStats!.insertions}`)} ${pico.red(`-${diffStats!.deletions}`)})`;

  await runComposer({
    message: msg,
    verb: opts.verb,
    verbPast: opts.verbPast,
    dryRunNote: opts.dryRunNote,
    statsNote,
    dryRun: opts.dryRun,
    auto: opts.auto,
    regenerate: () => generateCommitMessage(diff, truncated, provider, model),
    commit: opts.commit,
  });
}