import { loadConfig, saveGlobalConfig, isValidProvider, CONFIG_KEYS } from './config.js';
import type { Config } from './config.js';
import { providers } from './provider.js';
import { promptForModel } from './models.js';
import { CliError } from './errors.js';

function mask(key: string): string {
  return key.length <= 8 ? '****' : `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function showValue(key: string, value: unknown): string {
  if (key === 'apiKey' && typeof value === 'string') return mask(value);
  return JSON.stringify(value) ?? '';
}

/** Parse a `config set` value. Throws on invalid input. */
export function parseConfigValue(key: string, raw: string): Config[keyof Config] {
  switch (key) {
    case 'provider':
      if (!isValidProvider(raw)) throw new Error(`Unknown provider "${raw}".`);
      return raw;
    case 'model':
    case 'apiKey':
      if (!raw.trim()) throw new Error(`${key} cannot be empty.`);
      return raw.trim();
    case 'maxDiffTokens': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) throw new Error('maxDiffTokens must be a positive integer.');
      return n;
    }
    case 'autoConfirm': {
      const v = raw.toLowerCase();
      if (['true', '1', 'yes'].includes(v)) return true;
      if (['false', '0', 'no'].includes(v)) return false;
      throw new Error('autoConfirm must be true or false.');
    }
    case 'commitTypes': {
      const list = raw.split(',').map(t => t.trim()).filter(Boolean);
      if (list.length === 0) throw new Error('commitTypes needs at least one type (comma-separated).');
      return list;
    }
    default:
      throw new Error(`Unknown key "${key}". Known keys: ${CONFIG_KEYS.join(', ')}`);
  }
}

export async function handleConfig(args: string[]): Promise<void> {
  const [sub, key, ...rest] = args;

  if (!sub || sub === 'list') {
    const config = loadConfig();
    for (const k of CONFIG_KEYS) {
      const v = config[k as keyof Config];
      if (v !== undefined) console.log(`${k}=${showValue(k, v)}`);
    }
    console.error('\n  Global config: ~/.mmit.json');
    return;
  }

  if (sub === 'get') {
    if (!key || !(CONFIG_KEYS as readonly string[]).includes(key)) {
      throw new CliError(`Usage: mmit config get <key>\nKeys: ${CONFIG_KEYS.join(', ')}`);
    }
    const value = loadConfig()[key as keyof Config];
    console.log(value === undefined ? '' : showValue(key, value));
    return;
  }

  if (sub === 'set') {
    const valueRaw = rest.join(' ');
    if (!key) {
      throw new CliError(`Usage: mmit config set <key> <value>\nKeys: ${CONFIG_KEYS.join(', ')}`);
    }
    if (key === 'provider' && (!valueRaw || process.stdin.isTTY)) {
      const { runSetupFlow } = await import('./setup.js');
      if (valueRaw && !isValidProvider(valueRaw)) {
        throw new CliError(`Unknown provider "${valueRaw}".`);
      }
      await runSetupFlow(valueRaw || undefined, 'Switched. Run `mmit doctor` anytime to re-check.');
      return;
    }
    if (!valueRaw && key === 'model') {
      const config = loadConfig();
      const providerName = config.provider || 'openai';
      const provider = providers[providerName];
      const current = config.model || provider?.defaultModel || '';
      const picked = await promptForModel(providerName, current, provider?.defaultModel || current);
      if (!picked) {
        throw new CliError('Cancelled.');
      }
      const next = { ...config, model: picked } as Config;
      saveGlobalConfig(next);
      console.log(`model=${picked}`);
      return;
    }
    if (!valueRaw) {
      throw new CliError(`Usage: mmit config set <key> <value>\nKeys: ${CONFIG_KEYS.join(', ')}`);
    }
    let value: Config[keyof Config];
    try {
      value = parseConfigValue(key, valueRaw);
    } catch (err) {
      throw new CliError(err instanceof Error ? err.message : String(err));
    }
    const next = { ...loadConfig(), [key]: value } as Config;
    saveGlobalConfig(next);
    console.log(`${key}=${showValue(key, value)}`);
    return;
  }

  throw new CliError('Usage: mmit config [list|get <key>|set <key> <value>]');
}
