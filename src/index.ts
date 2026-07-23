#!/usr/bin/env node

import { program } from 'commander';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig, saveGlobalConfig, detectProviderFromEnv } from './config.js';
import { generateCommitMessage } from './engine.js';
import { generateChangelog } from './changelog.js';
import { handleRelease } from './release.js';
import { getGitDiff, stageAllAndDiff, createCommit, getDiffStats, isGitRepo, hasUnstagedChanges, getUnstagedStats } from './git.js';
import { renderHeader, VERSION } from './logo.js';

export async function run(): Promise<void> {

  // Handle `mmit init` before commander parsing
  if (process.argv.includes('init')) {
    await handleInit();
    return;
  }

  // Handle `mmit changelog` before commander parsing
  if (process.argv.includes('changelog')) {
    await handleChangelog();
    return;
  }

  // Handle `mmit release` before commander parsing
  if (process.argv.includes('release')) {
    await handleRelease();
    return;
  }

  if (!isGitRepo()) {
    process.stderr.write(renderHeader() + '\n');
    p.intro('');
    p.outro(pico.red('Not a git repository'));
    process.exit(1);
  }

  program
    .name('mmit')
    .description('AI-powered git workflow tool')
    .version(VERSION)
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

  // Handle --diff-only
  if (opts.diffOnly) {
    const { diff } = getGitDiff();
    console.log(diff || '(no diff)');
    return;
  }

  const provider = opts.provider || loadConfig().provider || detectProviderFromEnv();
  const model = opts.model;

  process.stderr.write(renderHeader() + '\n');
  p.intro('');

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

  if (staged && hasUnstagedChanges()) {
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
  process.stderr.write(renderHeader() + '\n');
  p.intro('');

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

async function handleChangelog(): Promise<void> {
  process.stderr.write(renderHeader() + '\n');

  const hasAll = process.argv.includes('--all') || process.argv.includes('-a');
  const hasWrite = process.argv.includes('--write') || process.argv.includes('-w');
  const hasVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const hasCompact = process.argv.includes('--compact');
  let output = '';
  let from = '';
  let to = '';

  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if ((arg === '--output' || arg === '-o') && i + 1 < process.argv.length) {
      output = process.argv[++i];
    }
    if (arg === '--from' && i + 1 < process.argv.length) {
      from = process.argv[++i];
    }
    if (arg === '--to' && i + 1 < process.argv.length) {
      to = process.argv[++i];
    }
  }

  const result = await generateChangelog({
    all: hasAll,
    verbose: hasVerbose,
    compact: hasCompact,
    write: hasWrite,
    output: output || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  if (!result) {
    console.log('No commits found.');
    return;
  }

  if (!hasWrite && !output) {
    console.log(result);
  }
}
