import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig } from './config.js';
import { runFlow } from './flow.js';
import { isGitRepo, amendCommit } from './git.js';
import { renderHeader } from './logo.js';

export interface AmendOptions {
  provider?: string;
  model?: string;
  dryRun?: boolean;
  auto?: boolean;
}

export async function handleAmend(opts: AmendOptions = {}): Promise<void> {
  if (!isGitRepo()) {
    process.stderr.write(renderHeader() + '\n');
    p.intro('');
    p.outro(pico.red('Not a git repository'));
    process.exit(1);
    return;
  }

  try {
    execSync('git rev-parse HEAD', { stdio: 'pipe' });
  } catch {
    process.stderr.write(renderHeader() + '\n');
    p.intro('');
    p.outro(pico.red('No commits yet. Nothing to amend.'));
    process.exit(1);
    return;
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