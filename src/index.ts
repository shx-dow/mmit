#!/usr/bin/env node

import { program } from 'commander';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig, saveGlobalConfig, detectProviderFromEnv } from './config.js';
import { generateCommitMessage } from './engine.js';
import { getGitDiff, stageAllAndDiff, createCommit, getDiffStats } from './git.js';

export async function run(): Promise<void> {
  const version = '0.1.0';

  // Handle `mmit init` before commander parsing
  if (process.argv.includes('init')) {
    await handleInit();
    return;
  }

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
    p.log.warn('No API key found.');
    const runInit = await p.confirm({
      message: 'Run `mmit init` to set one up?',
      initialValue: true,
    });

    if (p.isCancel(runInit) || !runInit) {
      p.outro('Cancelled.');
      return;
    }

    await handleInit();
    return;
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
    p.log.step(msg.subject);
    if (msg.body) {
      const bullets = msg.body
        .split('\n')
        .map(l => `  ${l.replace(/^-\s*/, '• ')}`)
        .join('\n');
      p.log.message(bullets);
    }

    if (opts.dryRun || opts.auto || loadConfig().autoConfirm) {
      if (opts.dryRun) {
        console.log(msg.body ? `${msg.subject}\n\n${msg.body}` : msg.subject);
        p.outro('Dry-run — not committing.');
      } else {
        const hash = createCommit(msg.subject, msg.body);
        p.outro(pico.green(`Committed as ${hash}  (${statsLine}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)})`));
      }
      break;
    }

    const action = await p.select({
      message: 'What do you want to do?',
      options: [
        { value: 'subject', label: 'Commit (subject only)', hint: 'first line only' },
        ...(msg.body ? [{ value: 'body', label: 'Commit (subject + body)', hint: 'includes body' }] : []),
        { value: 'edit', label: 'Edit', hint: 'edit the message manually' },
        { value: 'regenerate', label: 'Regenerate', hint: 'generate a new message' },
        { value: 'cancel', label: 'Cancel' },
      ],
    });

    if (p.isCancel(action) || action === 'cancel') {
      p.outro('Cancelled.');
      break;
    }

    if (action === 'subject') {
      const hash = createCommit(msg.subject, undefined);
      p.outro(pico.green(`Committed as ${hash}  (${statsLine}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)})`));
      break;
    }

    if (action === 'body') {
      const hash = createCommit(msg.subject, msg.body);
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
        initialValue: msg.subject,
        validate: (val: string) => {
          if (!val.trim()) return 'Message cannot be empty';
        },
      });

      if (p.isCancel(edited)) {
        continue;
      }

      msg.subject = edited.trim();
      p.log.step(msg.subject);

      const confirmEdit = await p.confirm({
        message: 'Commit with this message?',
        initialValue: true,
      });

      if (p.isCancel(confirmEdit)) {
        continue;
      }

      if (confirmEdit) {
        const hash = createCommit(msg.subject, msg.body);
        p.outro(pico.green(`Committed as ${hash}  (${statsLine}, ${pico.green(`+${diffStats.insertions}`)} ${pico.red(`-${diffStats.deletions}`)})`));
        break;
      }

      continue;
    }
  }
}

const PROVIDER_INFO: Record<string, { env: string; defaultModel: string }> = {
  openai:    { env: 'OPENAI_API_KEY',    defaultModel: 'gpt-4o-mini' },
  anthropic: { env: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-4-20250514' },
  gemini:    { env: 'GEMINI_API_KEY',    defaultModel: 'gemini-3.1-flash-lite' },
  openrouter:{ env: 'OPENROUTER_API_KEY',defaultModel: 'openrouter/free' },
};

async function handleInit(): Promise<void> {
  p.intro(pico.bold('mmit init'));

  const provider = await p.select({
    message: 'AI provider',
    options: Object.entries(PROVIDER_INFO).map(([name, info]) => ({
      value: name,
      label: name,
      hint: process.env[info.env] ? pico.green('✓ env var set') : `env: ${info.env}`,
    })),
  });

  if (p.isCancel(provider)) {
    p.outro('Cancelled.');
    return;
  }

  const info = PROVIDER_INFO[provider as string];
  if (!info) return;

  let apiKey = process.env[info.env] || '';

  if (!apiKey) {
    const input = await p.password({
      message: `Paste your ${info.env} API key`,
      validate: (val: string) => {
        if (!val.trim()) return 'API key cannot be empty';
      },
    });

    if (p.isCancel(input)) {
      p.outro('Cancelled.');
      return;
    }

    apiKey = (input as string).trim();
  }

  const model = await p.text({
    message: `Default model for ${provider}`,
    initialValue: info.defaultModel,
    validate: (val: string) => {
      if (!val.trim()) return 'Model name cannot be empty';
    },
  });

  if (p.isCancel(model)) return;

  const config = loadConfig();
  config.provider = provider as string;
  config.model = (model as string).trim();
  if (apiKey && !process.env[info.env]) {
    config.apiKey = apiKey;
  }
  saveGlobalConfig(config);

  p.outro(pico.green(`Config saved to ~/.mmit.json`));
}
