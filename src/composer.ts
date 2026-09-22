import * as p from '@clack/prompts';
import pico from 'picocolors';
import type { GeneratedMessage, VariationOptions } from './engine.js';

export interface ComposerOptions {
  message: GeneratedMessage;
  verb: string;
  verbPast: string;
  dryRunNote: string;
  statsNote: string;
  dryRun: boolean;
  auto: boolean;
  regenerate: (variation?: VariationOptions) => Promise<GeneratedMessage>;
  commit: (subject: string, body?: string) => string;
}

export async function runComposer(opts: ComposerOptions): Promise<void> {
  const msg = opts.message;
  const previousSubjects: string[] = [];
  let regenAttempt = 0;

  p.log.step(pico.dim(`${msg.provider} · ${msg.model}`));

  while (true) {
    p.log.step(msg.subject);
    if (msg.body) {
      const bullets = msg.body
        .split('\n')
        .map(l => `  ${l.replace(/^-\s*/, '• ')}`)
        .join('\n');
      p.log.message(bullets);
    }

    if (opts.dryRun || opts.auto) {
      if (opts.dryRun) {
        console.log(msg.body ? `${msg.subject}\n\n${msg.body}` : msg.subject);
        p.outro(`Dry-run — ${opts.dryRunNote}`);
      } else {
        const hash = opts.commit(msg.subject, msg.body);
        p.outro(pico.green(`${opts.verbPast} as ${hash}${opts.statsNote}`));
      }
      return;
    }

    const action = await p.select({
      message: 'What do you want to do?',
      options: [
        { value: 'subject', label: `${opts.verb} (subject only)`, hint: 'first line only' },
        ...(msg.body ? [{ value: 'body', label: `${opts.verb} (subject + body)`, hint: 'includes body' }] : []),
        { value: 'edit', label: 'Edit', hint: 'edit the message manually' },
        { value: 'regenerate', label: 'Regenerate', hint: 'generate a new message' },
        { value: 'cancel', label: 'Cancel' },
      ],
    });

    if (p.isCancel(action) || action === 'cancel') {
      p.outro('Cancelled.');
      return;
    }

    if (action === 'subject') {
      const hash = opts.commit(msg.subject, undefined);
      p.outro(pico.green(`${opts.verbPast} as ${hash}${opts.statsNote}`));
      return;
    }

    if (action === 'body') {
      const hash = opts.commit(msg.subject, msg.body);
      p.outro(pico.green(`${opts.verbPast} as ${hash}${opts.statsNote}`));
      return;
    }

    if (action === 'regenerate') {
      const direction = await p.select({
        message: 'What should change?',
        options: [
          { value: 'different', label: 'Different angle', hint: 'default' },
          { value: 'shorter', label: 'Shorter subject', hint: 'aim under 50 chars' },
          { value: 'type', label: 'Different type', hint: 'rethink feat/fix/refactor' },
          { value: 'scope', label: 'Different scope', hint: 'rethink the (scope)' },
          { value: 'body', label: 'Toggle body', hint: msg.body ? 'drop the body' : 'add a body' },
          { value: 'custom', label: 'Custom hint...', hint: 'type your own focus' },
        ],
      });

      if (p.isCancel(direction)) {
        continue;
      }

      let hint: string | undefined;
      if (direction === 'shorter') hint = 'Keep the subject shorter and more direct.';
      else if (direction === 'type') hint = 'Reconsider the commit type — try a different one.';
      else if (direction === 'scope') hint = 'Reconsider the scope — try a different or no scope.';
      else if (direction === 'body') {
        hint = msg.body
          ? 'Respond with ONLY the subject line, no body.'
          : 'Include a body with bullet points explaining why.';
      } else if (direction === 'custom') {
        const custom = await p.text({
          message: 'What should the message focus on? (what to avoid?)',
          placeholder: 'e.g. focus on the API change, not the tests',
        });
        if (p.isCancel(custom)) continue;
        hint = (custom as string).trim() || undefined;
      }

      previousSubjects.push(msg.subject);
      regenAttempt += 1;
      const temperature = Math.min(0.3 + 0.4 * regenAttempt, 1.0);

      const spin = p.spinner();
      spin.start('Regenerating...');
      try {
        const next = await opts.regenerate({ temperature, avoid: [...previousSubjects], hint });
        msg.subject = next.subject;
        msg.body = next.body;
        msg.provider = next.provider;
        msg.model = next.model;
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
      const editedSubject = await p.text({
        message: 'Edit the commit subject',
        initialValue: msg.subject,
        validate: (val: string) => {
          if (!val.trim()) return 'Message cannot be empty';
        },
      });

      if (p.isCancel(editedSubject)) {
        continue;
      }

      msg.subject = editedSubject.trim();

      const editBody = await p.confirm({
        message: msg.body ? 'Edit the body too?' : 'Add a body?',
        initialValue: !!msg.body,
      });

      if (p.isCancel(editBody)) {
        continue;
      }

      if (editBody) {
        const editedBody = await p.text({
          message: msg.body ? 'Edit the commit body (leave empty to remove)' : 'Add a commit body (optional)',
          initialValue: msg.body,
          placeholder: 'optional — explain why, not how',
        });

        if (p.isCancel(editedBody)) {
          continue;
        }

        msg.body = (editedBody as string).trim() || undefined;
      }

      continue;
    }
  }
}
