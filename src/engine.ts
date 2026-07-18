import { providers } from './provider.js';
import type { ProviderConfig } from './provider.js';
import { loadConfig, detectProviderFromEnv, envKeyMap } from './config.js';

export interface GeneratedMessage {
  message: string;
  provider: string;
  model: string;
}

const COMMIT_PATTERN = /^[a-zA-Z]+(\([a-zA-Z0-9_.-/]+\))?:\s.+/;

function isValidCommitMessage(msg: string): boolean {
  return COMMIT_PATTERN.test(msg) && msg.length <= 100;
}

function clean(raw: string): string {
  return raw
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```$/gm, '')
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .split('\n')[0];
}

function buildPrompt(diff: string, commitTypes: string[], truncated: boolean, strict: boolean = false): string {
  const types = commitTypes.join(', ');

  const strictRule = strict
    ? '\nCRITICAL: Respond with ONLY the commit message. No explanations, no analysis, no markdown. Just one line.'
    : '';

  return `Generate a conventional commit message for the following git diff.

Commit types available: ${types}

The message format must follow conventional commits: <type>(<scope>): <description>

Examples:
- feat(api): add user authentication endpoint
- fix(parser): handle null input gracefully
- docs(readme): update installation instructions
- refactor(core): simplify state management

Rules:
- Use the imperative mood ("add" not "added" / "adds")
- First line max 72 characters
- Scope is optional - infer from the files changed
- If the change is a simple "typo fix" just say "fix: fix typo"
- Respond with only the commit message — no intro, no explanation${strictRule}

${truncated ? '(Note: the diff was truncated due to size. Generate a message for what is visible.)\n' : ''}
Diff:
${diff}`;
}

export async function generateCommitMessage(
  diff: string,
  truncated: boolean,
  overrideProvider?: string,
  overrideModel?: string,
): Promise<GeneratedMessage> {
  const config = loadConfig();

  // Determine provider and model
  const providerName = overrideProvider
    || config.provider
    || detectProviderFromEnv(config.provider)
    || 'openai';

  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown provider "${providerName}". Available: ${Object.keys(providers).join(', ')}`);
  }

  const apiKey = process.env[envKeyMap[providerName]];
  if (!apiKey) {
    throw new Error(`Missing ${envKeyMap[providerName]} environment variable for provider "${providerName}"`);
  }

  // Determine model with good defaults
  const defaultModels: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4-20250514',
    gemini: 'gemini-3.1-flash-lite',
    openrouter: 'openrouter/free',
  };

  const model = overrideModel || config.model || defaultModels[providerName];

  const providerConfig: ProviderConfig = {
    apiKey,
    model,
    maxTokens: 300,
  };

  // Attempt 1: normal prompt
  let prompt = buildPrompt(diff, config.commitTypes ?? [], truncated);
  let raw = await provider.generate(prompt, providerConfig);
  let message = clean(raw);

  // Attempt 2: stricter prompt if model rambled
  if (!isValidCommitMessage(message)) {
    prompt = buildPrompt(diff, config.commitTypes ?? [], truncated, true);
    raw = await provider.generate(prompt, providerConfig);
    message = clean(raw);
  }

  // Final check
  if (!isValidCommitMessage(message)) {
    throw new Error(
      `Model returned an invalid response. Try a different model.\n  Got: ${message}`,
    );
  }

  return { message, provider: providerName, model };
}
