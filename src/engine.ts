import { providers, detectProviderFromEnv, isRetryableProviderError } from './provider.js';
import type { ProviderConfig } from './provider.js';
import { loadConfig } from './config.js';

export interface GeneratedMessage {
  subject: string;
  body?: string;
  provider: string;
  model: string;
}

const COMMIT_PATTERN = /^[a-zA-Z]+(\([a-zA-Z0-9_.\-,/]+\))?!?:\s.+/;
const SUBJECT_HARD_LIMIT = 100;
const SUBJECT_SOFT_LIMIT = 72;

export function isValidCommitMessage(msg: string, commitTypes?: string[]): boolean {
  return validateSubject(msg, commitTypes) === undefined;
}

export function validateSubject(subject: string, commitTypes?: string[]): string | undefined {
  const s = subject.trim();
  if (!s) return 'Message cannot be empty';
  if (s.length > SUBJECT_HARD_LIMIT) {
    return `Subject is ${s.length} chars (max ${SUBJECT_HARD_LIMIT}, aim ${SUBJECT_SOFT_LIMIT})`;
  }
  if (!COMMIT_PATTERN.test(s)) return 'Use "<type>(<scope>): <description>"';
  if (commitTypes && commitTypes.length > 0) {
    const type = s.split(/[(}!:]/)[0].toLowerCase();
    if (!commitTypes.map(t => t.toLowerCase()).includes(type)) {
      return `Unknown type. Use one of: ${commitTypes.join(', ')}`;
    }
  }
  return undefined;
}

function stripCodeFences(raw: string): string {
  const lines = raw.split('\n');
  if (lines.length > 0 && lines[0].trim().startsWith('```')) {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
    lines.pop();
  }
  return lines.join('\n');
}

function splitSubjectBody(raw: string): { subject: string; body?: string } {
  let cleaned = stripCodeFences(raw).trim();
  if (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  const lines = cleaned.split('\n');
  const subject = lines[0].trim();
  const rest = lines.slice(1).map(l => l.trim()).filter(Boolean).join('\n');
  return { subject, body: rest || undefined };
}

export interface VariationOptions {
  temperature?: number;
  avoid?: string[];
  hint?: string;
}

function renderVariation(variation?: VariationOptions): string {
  if (!variation) return '';
  const lines: string[] = [];
  if (variation.avoid && variation.avoid.length > 0) {
    lines.push('Provide a DIFFERENT message from previous attempts.');
    for (const s of variation.avoid.slice(-5)) {
      lines.push(`- Avoid: "${s}"`);
    }
  }
  if (variation.hint) {
    lines.push(`Focus: ${variation.hint}`);
  }
  if (lines.length === 0) return '';
  return `\nVariation guidance:\n${lines.join('\n')}\n`;
}

function buildPrompt(
  diff: string,
  commitTypes: string[],
  truncated: boolean,
  strict: boolean = false,
  variation?: VariationOptions,
): string {
  const types = commitTypes.join(', ');

  const strictRule = strict
    ? '\nCRITICAL: Respond with ONLY the first line of the commit message. No body, no explanations.'
    : '\nYou may optionally include a body paragraph explaining the change.';

  const variationBlock = renderVariation(variation);

  return `Generate a conventional commit message for the following git diff.

Commit types available: ${types}

Format:
<type>(<scope>): <description>

<optional body, explain why, not how>

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
${variationBlock}
${truncated ? '(Note: the diff was truncated due to size. Generate a message for what is visible.)\n' : ''}
Diff:
${diff}`;
}

export async function generateCommitMessage(
  diff: string,
  truncated: boolean,
  overrideProvider?: string,
  overrideModel?: string,
  variation?: VariationOptions,
): Promise<GeneratedMessage> {
  const config = loadConfig();
  const commitTypes = config.commitTypes ?? [];

  // Explicit provider always wins — never silently switch to another provider
  // when the user (or project config) named one. Fall back to env detection
  // only when nothing was named.
  const explicitName = overrideProvider || config.provider;
  if (explicitName && !providers[explicitName]) {
    throw new Error(`Unknown provider "${explicitName}". Available: ${Object.keys(providers).join(', ')}`);
  }
  const providerName = explicitName || detectProviderFromEnv() || 'openai';

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
    temperature: variation?.temperature,
  };

  async function generateOnce(strict: boolean): Promise<{ raw: string; parsed: { subject: string; body?: string } }> {
    const prompt = buildPrompt(diff, commitTypes, truncated, strict, variation);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await provider.generate(prompt, providerConfig);
        return { raw, parsed: splitSubjectBody(raw) };
      } catch (err) {
        const retryable = isRetryableProviderError(err);
        if (attempt === 2 || !retryable) throw err;
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw new Error('unreachable');
  }

  // Attempt 1: normal prompt
  let { parsed } = await generateOnce(false);

  // Attempt 2: stricter prompt if model rambled
  if (!isValidCommitMessage(parsed.subject, commitTypes)) {
    ({ parsed } = await generateOnce(true));
  }

  // Final check
  if (!isValidCommitMessage(parsed.subject, commitTypes)) {
    const hint =
      parsed.subject.length > SUBJECT_HARD_LIMIT
        ? `Subject is ${parsed.subject.length} chars (max ${SUBJECT_HARD_LIMIT}, aim ${SUBJECT_SOFT_LIMIT}).`
        : `Subject must be "<type>(<scope>): <description>" using one of: ${commitTypes.join(', ')}.`;
    throw new Error(`Model returned an invalid response. ${hint}\n  Got: ${parsed.subject}`);
  }

  return {
    subject: parsed.subject,
    body: parsed.body,
    provider: providerName,
    model,
  };
}
