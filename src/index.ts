#!/usr/bin/env node

import { program } from 'commander';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig, saveGlobalConfig, detectProviderFromEnv } from './config.js';
import { generateCommitMessage } from './engine.js';
import { getGitDiff, stageAllAndDiff, createCommit, getDiffStats } from './git.js';

export async function run(): Promise<void> {
  const version = '0.1.0';
  program
    .name('mmit')
    .description('AI-powered git commit message generator')
    .version(version)
    .option('-p, --provider <name>', 'AI provider (openai, anthropic, gemini, openrouter)')
    .option('-m, --model <name>', 'Model name override')
    .option('-d, --diff-only', 'Print diff and exit')
    .option('--dry-run', 'Generate message but do not commit')
    .option('--config', 'Open global config for editing')
    .option('--auto', 'Auto-confirm without interactive prompt');

  program.parse(process.argv);
  const opts = program.opts();

  // Handle --config
  if (opts.config) {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
    console.error('\n  Global config: ~/.mmit.json');
    console.error('  Local config:  .mmit.json in project root (overrides global)');
    return;
  }

  // Handle --diff-only
  if (opts.diffOnly) {
    const { diff } = getGitDiff();
    console.log(diff || '(no diff)');
    return;
  }

  const provider = opts.provider || loadConfig().provider || detectProviderFromEnv();
  const model = opts.model;

  p.intro(pico.bold(`mmit v${version}`));

  const diffResult = getGitDiff();
  let diff = diffResult.diff;
  let staged = diffResult.staged;

  if (!diff) {
    const shouldStage = await p.confirm({
      message: 'No staged changes. Stage all and proceed?',
      initialValue: true,
    });

    if (p.isCancel(shouldStage) || !shouldStage) {
      p.outro('Cancelled.');
      return;
    }

    const result = stageAllAndDiff();
    diff = result.diff;
    staged = result.staged;

    if (!diff) {
      p.outro(pico.red('No diff to commit.'));
      return;
    }
  }

  // Detect if we need a provider setup
  if (!provider) {
    p.log.warn('No API key found in environment.');

    const choice = await p.select({
      message: 'Choose a provider',
      options: [
        { value: 'openai', label: 'OpenAI', hint: 'env: OPENAI_API_KEY' },
        { value: 'anthropic', label: 'Anthropic', hint: 'env: ANTHROPIC_API_KEY' },
        { value: 'gemini', label: 'Gemini', hint: 'env: GEMINI_API_KEY' },
        { value: 'openrouter', label: 'OpenRouter', hint: 'env: OPENROUTER_API_KEY' },
      ],
    });

    if (p.isCancel(choice)) {
      p.outro('Cancelled.');
      return;
    }

    p.log.error(`Set ${String(choice).toUpperCase()}_API_KEY in your environment and re-run.`);
    process.exit(1);
  }

  const diffStats = getDiffStats();
  const statsLine = `${diffStats.files} file${diffStats.files !== 1 ? 's' : ''} changed`;
  p.log.step(`${pico.dim(statsLine)}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)}`);

  const spin = p.spinner();
  spin.start('Generating commit message...');

  let msg: Awaited<ReturnType<typeof generateCommitMessage>>;

  try {
    msg = await generateCommitMessage(diff, diffResult.truncated, provider, model);
  } catch (err: unknown) {
    spin.stop('Error');
    const message = err instanceof Error ? err.message : String(err);
    p.outro(pico.red(`Generation failed: ${message}`));
    process.exit(1);
    return;
  }

  spin.stop('Done');

  p.log.step(pico.dim(`${msg.provider} · ${msg.model}`));

  // Interactive loop
  while (true) {
    p.log.step(msg.message);

    if (opts.dryRun || opts.auto || loadConfig().autoConfirm) {
      if (opts.dryRun) {
        console.log(msg.message);
        p.outro('Dry-run — not committing.');
      } else {
        const hash = createCommit(msg.message);
        p.outro(pico.green(`Committed as ${hash}  (${statsLine}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)})`));
      }
      break;
    }

    const action = await p.select({
      message: 'What do you want to do?',
      options: [
        { value: 'commit', label: 'Commit', hint: 'use this message' },
        { value: 'regenerate', label: 'Regenerate', hint: 'generate a new message' },
        { value: 'edit', label: 'Edit', hint: 'edit the message manually' },
        { value: 'cancel', label: 'Cancel' },
      ],
    });

    if (p.isCancel(action) || action === 'cancel') {
      p.outro('Cancelled.');
      break;
    }

    if (action === 'commit') {
      const hash = createCommit(msg.message);
      p.outro(pico.green(`Committed as ${hash}  (${statsLine}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)})`));
      break;
    }

    if (action === 'regenerate') {
      spin.start('Regenerating...');
      try {
        msg = await generateCommitMessage(diff, diffResult.truncated, provider, model);
      } catch (err: unknown) {
        spin.stop('Error');
        const message = err instanceof Error ? err.message : String(err);
        p.outro(pico.red(`Generation failed: ${message}`));
        process.exit(1);
      }
      spin.stop('Done');
      continue;
    }

    if (action === 'edit') {
      const edited = await p.text({
        message: 'Edit the commit message',
        initialValue: msg.message,
        validate: (val: string) => {
          if (!val.trim()) return 'Message cannot be empty';
        },
      });

      if (p.isCancel(edited)) {
        continue;
      }

      msg = { ...msg, message: edited.trim() };
      p.log.step(msg.message);

      const confirmEdit = await p.confirm({
        message: 'Commit with this message?',
        initialValue: true,
      });

      if (p.isCancel(confirmEdit)) {
        continue;
      }

      if (confirmEdit) {
        const hash = createCommit(msg.message);
        p.outro(pico.green(`Committed as ${hash}  (${statsLine}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)})`));
        break;
      }

      continue;
    }
  }
}
