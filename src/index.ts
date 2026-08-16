#!/usr/bin/env node

import { program } from 'commander';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig } from './config.js';
import { runFlow } from './flow.js';
import { handleAmend } from './amend.js';
import { handleChangelog } from './changelog.js';
import { handleRelease } from './release.js';
import { handleInit } from './init.js';
import { getGitDiff, createCommit } from './git.js';
import { renderHeader, VERSION } from './logo.js';

export async function run(): Promise<void> {
  program
    .name('mmit')
    .description('AI-powered git workflow tool')
    .version(VERSION)
    .option('-p, --provider <name>', 'AI provider (openai, anthropic, gemini, openrouter)')
    .option('-m, --model <name>', 'Model name override')
    .option('-d, --diff-only', 'Print diff and exit')
    .option('--dry-run', 'Generate message but do not commit')
    .option('--config', 'Open global config for editing')
    .option('--auto', 'Auto-confirm without interactive prompt')
    .action(runCommitFlow);

  program
    .command('init')
    .description('Set up API provider and model')
    .action(() => handleInit());

  program
    .command('changelog')
    .description('Generate a changelog from conventional commits')
    .option('-a, --all', 'Generate from all tags')
    .option('-w, --write', 'Write to CHANGELOG.md')
    .option('-v, --verbose', 'Include maintenance commits')
    .option('--compact', 'Compact one-line format')
    .option('-o, --output <file>', 'Write to a file')
    .option('--from <ref>', 'Start commit/tag')
    .option('--to <ref>', 'End commit/tag (default HEAD)')
    .action(async (opts) => {
      await handleChangelog(opts);
    });

  program
    .command('amend')
    .description('Amend the last commit with an AI-generated message')
    .option('-p, --provider <name>', 'AI provider')
    .option('-m, --model <name>', 'Model name override')
    .option('--dry-run', 'Generate message but do not amend')
    .option('--auto', 'Auto-confirm without interactive prompt')
    .action(async (opts) => {
      await handleAmend(opts);
    });

  program
    .command('release')
    .description('Release a new version with changelog, version bump, and tag')
    .argument('[bump]', 'patch, minor, or major')
    .option('--dry-run', 'Show what would happen')
    .option('--no-tag', 'Do not tag the release')
    .option('--compact', 'Compact changelog format')
    .action(async (bump, opts) => {
      await handleRelease({ bump, ...opts });
    });

  await program.parseAsync(process.argv);
}

interface CommitCliOptions {
  provider?: string;
  model?: string;
  diffOnly?: boolean;
  dryRun?: boolean;
  config?: boolean;
  auto?: boolean;
}

async function runCommitFlow(opts: CommitCliOptions): Promise<void> {
  if (opts.config) {
    const config = loadConfig();
    if (config.apiKey) {
      const key = config.apiKey;
      const prefix = key.slice(0, 4);
      const suffix = key.slice(-4);
      config.apiKey = `${prefix}...${suffix}`;
    }
    console.log(JSON.stringify(config, null, 2));
    console.error('\n  Global config: ~/.mmit.json');
    console.error('  Local config:  .mmit.json in project root (overrides global)');
    return;
  }

  if (opts.diffOnly) {
    const { diff } = getGitDiff();
    console.log(diff || '(no diff)');
    return;
  }

  await runFlow({
    verb: 'Commit',
    verbPast: 'Committed',
    dryRunNote: 'not committing.',
    actionLabel: '',
    commit: createCommit,
    provider: opts.provider,
    model: opts.model,
    dryRun: !!opts.dryRun,
    auto: !!(opts.auto || loadConfig().autoConfirm),
    warnUnstaged: true,
    runInitOnMissingProvider: true,
  });
}