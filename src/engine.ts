import { providers, detectProviderFromEnv } from './provider.js';
import type { ProviderConfig } from './provider.js';
import { loadConfig } from './config.js';

export interface GeneratedMessage {
  subject: string;
  body?: string;
  provider: string;
  model: string;
}

const COMMIT_PATTERN = /^[a-zA-Z]+(\([a-zA-Z0-9_.\-,/]+\))?!?:\s.+/;

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
    : '\nYou may optionally include a body paragraph explaining the change.';

  return `Generate a conventional commit message for the following git diff.

Commit types available: ${types}

Format:
<type>(<scope>): <description>

<optional body — explain why, not how>

<optional footers>

Examples:

- feat(api): add user authentication endpoint

  - Required for mobile clients that need long-lived sessions
  - Prevents abuse of the auth endpoint under heavy load
  Closes #142

- fix(parser): handle null input gracefully

  - Null values from the upstream API were crashing the parser
  Co-authored-by: Alice <alice@example.com>

- feat(api)!: remove deprecated /v2/users endpoint

  BREAKING CHANGE: The /v2/users endpoint has been removed. Use /v3/users instead.

Rules:

- Use the imperative mood ("add" not "added" / "adds")
- Subject line max 72 characters
- Scope is optional — infer from the files changed
- Always separate the subject and body with a blank line
- Write the body as bullet points (each prefixed with "-")
- Use the body to explain WHY the change was made, not WHAT (the diff already shows the what)
- Use footers for issue references (Closes, Refs), breaking changes (BREAKING CHANGE:), and co-authors
- For breaking changes, add "!" after the type/scope AND optionally a BREAKING CHANGE footer
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

  const apiKey = process.env[providers[providerName].envKey] || config.apiKey;
  if (!apiKey) {
    throw new Error(`Missing ${providers[providerName].envKey} for provider "${providerName}". Run \`mmit init\` to set one up.`);
  }

  const model = overrideModel || config.model || providers[providerName].defaultModel;

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
