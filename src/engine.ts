import { providers } from './provider.js';
import type { ProviderConfig } from './provider.js';
import { loadConfig, detectProviderFromEnv, envKeyMap } from './config.js';

export interface GeneratedMessage {
  subject: string;
  body?: string;
  provider: string;
  model: string;
}

const COMMIT_PATTERN = /^[a-zA-Z]+(\([a-zA-Z0-9_.-/]+\))?:\s.+/;

function isValidCommitMessage(msg: string): boolean {
  return COMMIT_PATTERN.test(msg) && msg.length <= 100;
}

function splitSubjectBody(raw: string): { subject: string; body?: string } {
  const cleaned = raw
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```$/gm, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();

  const lines = cleaned.split('\n');
  const subject = lines[0].trim();
  const rest = lines.slice(1).map(l => l.trim()).filter(Boolean).join('\n');
  return { subject, body: rest || undefined };
}

function buildPrompt(diff: string, commitTypes: string[], truncated: boolean, strict: boolean = false): string {
  const types = commitTypes.join(', ');

  const strictRule = strict
    ? '\nCRITICAL: Respond with ONLY the first line of the commit message. No body, no explanations.'
    : '\nYou may optionally include a body paragraph after a blank line explaining the change.';

  return `Generate a conventional commit message for the following git diff.

Commit types available: ${types}

Format:
<type>(<scope>): <description>

(optional blank line followed by bullet points explaining the change)

Examples:
- feat(api): add user authentication endpoint

  - Adds JWT-based login with refresh token rotation
  - Implements rate limiting on auth endpoints
  - Handles token expiry with automatic refresh

- fix(parser): handle null input gracefully

  - Fixes crash when receiving null values from the API
  - Returns empty result set as fallback
  - Adds regression tests for edge cases

Rules:
- Use the imperative mood ("add" not "added" / "adds")
- First line max 72 characters
- Scope is optional - infer from the files changed
- Each bullet point should be a single line under the subject
- Keep bullet points brief and specific
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

  const apiKey = process.env[envKeyMap[providerName]] || config.apiKey;
  if (!apiKey) {
    throw new Error(`Missing ${envKeyMap[providerName]} for provider "${providerName}". Run \`mmit init\` to set one up.`);
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
    maxTokens: 500,
  };

  // Attempt 1: normal prompt
  let prompt = buildPrompt(diff, config.commitTypes ?? [], truncated);
  let raw = await provider.generate(prompt, providerConfig);
  let parsed = splitSubjectBody(raw);

  // Attempt 2: stricter prompt if model rambled
  if (!isValidCommitMessage(parsed.subject)) {
    prompt = buildPrompt(diff, config.commitTypes ?? [], truncated, true);
    raw = await provider.generate(prompt, providerConfig);
    parsed = splitSubjectBody(raw);
  }

  // Final check
  if (!isValidCommitMessage(parsed.subject)) {
    throw new Error(
      `Model returned an invalid response. Try a different model.\n  Got: ${parsed.subject}`,
    );
  }

  return {
    subject: parsed.subject,
    body: parsed.body,
    provider: providerName,
    model,
  };
}
