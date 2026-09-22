import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Config {
  // One of: openai, anthropic, gemini, openrouter
  provider?: string;
  // Model override
  model?: string;
  // API key (alternative to env var)
  apiKey?: string;
  // Max diff tokens to send
  maxDiffTokens?: number;
  // Custom commit types for the prompt
  commitTypes?: string[];
  // Always auto-confirm without interactive prompt
  autoConfirm?: boolean;
}

const GLOBAL_CONFIG_PATH = join(homedir(), '.mmit.json');

const VALID_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'openrouter']);

const DEFAULT_CONFIG: Config = {
  maxDiffTokens: 8000,
  commitTypes: [
    'feat', 'fix', 'chore', 'docs', 'refactor',
    'test', 'style', 'perf', 'ci', 'build', 'revert',
  ],
  autoConfirm: false,
};

function readJsonFile(file: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    console.error(`Warning: ${label} config at ${file} is not valid JSON — ignoring it.`);
    return {};
  }
}

function sanitize(raw: Record<string, unknown>, source: string): Partial<Config> {
  const out: Partial<Config> = {};
  if (raw.provider !== undefined) {
    if (typeof raw.provider === 'string' && VALID_PROVIDERS.has(raw.provider)) {
      out.provider = raw.provider;
    } else {
      console.error(`Warning: ignoring invalid provider in ${source} config: ${JSON.stringify(raw.provider)}`);
    }
  }
  if (raw.model !== undefined) {
    if (typeof raw.model === 'string' && raw.model.trim()) out.model = raw.model;
    else console.error(`Warning: ignoring invalid model in ${source} config.`);
  }
  if (raw.apiKey !== undefined) {
    if (typeof raw.apiKey === 'string' && raw.apiKey.trim()) out.apiKey = raw.apiKey;
    else console.error(`Warning: ignoring invalid apiKey in ${source} config.`);
  }
  if (raw.maxDiffTokens !== undefined) {
    if (typeof raw.maxDiffTokens === 'number' && Number.isInteger(raw.maxDiffTokens) && raw.maxDiffTokens > 0) {
      out.maxDiffTokens = raw.maxDiffTokens;
    } else {
      console.error(`Warning: ignoring invalid maxDiffTokens in ${source} config: ${JSON.stringify(raw.maxDiffTokens)}`);
    }
  }
  if (raw.commitTypes !== undefined) {
    if (Array.isArray(raw.commitTypes) && raw.commitTypes.every(t => typeof t === 'string' && t.trim())) {
      out.commitTypes = raw.commitTypes as string[];
    } else {
      console.error(`Warning: ignoring invalid commitTypes in ${source} config.`);
    }
  }
  if (raw.autoConfirm !== undefined) {
    if (typeof raw.autoConfirm === 'boolean') out.autoConfirm = raw.autoConfirm;
    else console.error(`Warning: ignoring invalid autoConfirm in ${source} config.`);
  }
  return out;
}

function findLocalConfig(): Record<string, unknown> | null {
  let dir = process.cwd();
  while (true) {
    const file = join(dir, '.mmit.json');
    if (existsSync(file)) {
      return readJsonFile(file, 'local');
    }
    const parent = resolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
}

let cached: Config | null = null;

export function clearConfigCache(): void {
  cached = null;
}

export function loadConfig(): Config {
  if (cached) return { ...cached };

  const globalRaw: Record<string, unknown> = existsSync(GLOBAL_CONFIG_PATH)
    ? readJsonFile(GLOBAL_CONFIG_PATH, 'global')
    : {};

  const localRaw = findLocalConfig();

  cached = {
    ...DEFAULT_CONFIG,
    ...sanitize(globalRaw, 'global'),
    ...(localRaw ? sanitize(localRaw, 'local') : {}),
  } as Config;
  return { ...cached };
}

export function saveGlobalConfig(config: Config): void {
  const toSave: Config = {};
  if (config.provider !== undefined) toSave.provider = config.provider;
  if (config.model !== undefined) toSave.model = config.model;
  if (config.apiKey !== undefined) toSave.apiKey = config.apiKey;
  if (config.maxDiffTokens !== undefined) toSave.maxDiffTokens = config.maxDiffTokens;
  if (config.commitTypes !== undefined) toSave.commitTypes = config.commitTypes;
  if (config.autoConfirm !== undefined) toSave.autoConfirm = config.autoConfirm;
  mkdirSync(homedir(), { recursive: true });
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(toSave, null, 2), 'utf-8');
  cached = { ...DEFAULT_CONFIG, ...toSave };
}
