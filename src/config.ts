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

const ENV_KEY_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export function detectProviderFromEnv(preferred?: string): string | null {
  const order = preferred && ENV_KEY_MAP[preferred]
    ? [preferred, ...Object.keys(ENV_KEY_MAP).filter(k => k !== preferred)]
    : Object.keys(ENV_KEY_MAP);

  for (const name of order) {
    if (process.env[ENV_KEY_MAP[name]]) return name;
  }
  return null;
}

export { ENV_KEY_MAP as envKeyMap };
