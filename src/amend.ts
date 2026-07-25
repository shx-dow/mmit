import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pico from 'picocolors';
import { generateCommitMessage } from './engine.js';
import { loadConfig, detectProviderFromEnv } from './config.js';
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

    if (dryRun || auto || loadConfig().autoConfirm) {
      if (dryRun) {
        console.log(msg.body ? `${msg.subject}\n\n${msg.body}` : msg.subject);
        p.outro('Dry-run — not amending.');
      } else {
        const hash = amendCommit(msg.subject, msg.body);
        p.outro(pico.green(`Amended as ${hash}${lastCommitOnly ? '' : `  (${statsLine}, ${pico.green(`+${getDiffStats().insertions}`)} ${pico.red(`-${getDiffStats().deletions}`)})`}`));
      }
      break;
    }

    const action = await p.select({
      message: 'What do you want to do?',
      options: [
        { value: 'subject', label: 'Amend (subject only)', hint: 'first line only' },
        ...(msg.body ? [{ value: 'body', label: 'Amend (subject + body)', hint: 'includes body' }] : []),
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
      const hash = amendCommit(msg.subject, undefined);
      p.outro(pico.green(`Amended as ${hash}${lastCommitOnly ? '' : `  (${statsLine}, ${pico.green(`+${getDiffStats().insertions}`)} ${pico.red(`-${getDiffStats().deletions}`)})`}`));
      break;
    }

    if (action === 'body') {
      const hash = amendCommit(msg.subject, msg.body);
      p.outro(pico.green(`Amended as ${hash}${lastCommitOnly ? '' : `  (${statsLine}, ${pico.green(`+${getDiffStats().insertions}`)} ${pico.red(`-${getDiffStats().deletions}`)})`}`));
      break;
    }

    if (action === 'regenerate') {
      spin.start('Regenerating...');
      try {
        msg = await generateCommitMessage(diff, truncated, provider, model);
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
        message: 'Amend with this message?',
        initialValue: true,
      });

      if (p.isCancel(confirmEdit)) {
        continue;
      }

      if (confirmEdit) {
        const hash = amendCommit(msg.subject, msg.body);
        p.outro(pico.green(`Amended as ${hash}${lastCommitOnly ? '' : `  (${statsLine}, ${pico.green(`+${getDiffStats().insertions}`)} ${pico.red(`-${getDiffStats().deletions}`)})`}`));
        break;
      }

      continue;
    }
  }
}
