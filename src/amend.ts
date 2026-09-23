import { execFileSync } from 'node:child_process';
import { loadConfig } from './config.js';
import { runFlow } from './flow.js';
import { isGitRepo, amendCommit } from './git.js';
import { CliError } from './errors.js';

export interface AmendOptions {
  provider?: string;
  model?: string;
  dryRun?: boolean;
  auto?: boolean;
}

export async function handleAmend(opts: AmendOptions = {}): Promise<void> {
  if (!isGitRepo()) {
    throw new CliError('Not a git repository');
  }

  try {
    execFileSync('git', ['rev-parse', 'HEAD'], { stdio: 'pipe' });
  } catch {
    throw new CliError('No commits yet. Nothing to amend.');
  }

  await runFlow({
    verb: 'Amend',
    verbPast: 'Amended',
    dryRunNote: 'not amending.',
    actionLabel: '`git commit --amend`  ',
    commit: amendCommit,
    provider: opts.provider,
    model: opts.model,
    dryRun: !!opts.dryRun,
    auto: !!(opts.auto || loadConfig().autoConfirm),
    fallbackToLastCommit: true,
    runInitOnMissingProvider: false,
  });
}
