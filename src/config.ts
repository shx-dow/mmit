import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Config {
  // One of: openai, anthropic, gemini, openrouter
  provider?: string;
  // Model override (e.g. gpt-4o-mini, claude-sonnet-4, gemini-2.0-flash)
  model?: string;
  // Max diff tokens to send
  maxDiffTokens?: number;
  // Custom commit types for the prompt
  commitTypes?: string[];
  // Always auto-confirm without interactive prompt
  autoConfirm?: boolean;
}

const GLOBAL_CONFIG_PATH = join(homedir(), '.mmit.json');

const DEFAULT_CONFIG: Config = {
  maxDiffTokens: 8000,
  commitTypes: [
    'feat', 'fix', 'chore', 'docs', 'refactor',
    'test', 'style', 'perf', 'ci', 'build', 'revert',
  ],
  autoConfirm: false,
};

function findLocalConfig(): Record<string, unknown> | null {
  let dir = process.cwd();
  while (true) {
    const file = join(dir, '.mmit.json');
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf-8'));
      } catch {
        return null;
      }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;

  const global: Record<string, unknown> = existsSync(GLOBAL_CONFIG_PATH)
    ? JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'))
    : {};

  const local = findLocalConfig();

  cached = { ...DEFAULT_CONFIG, ...global, ...local } as Config;
  return cached;
}

export function saveGlobalConfig(config: Config): void {
  mkdirSync(homedir(), { recursive: true });
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  cached = config;
}

export function detectProviderFromEnv(): string | null {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  return null;
}
