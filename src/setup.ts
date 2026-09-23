import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig, saveGlobalConfig } from './config.js';
import { providers, KEY_URLS, friendlyProviderError } from './provider.js';
import { generateCommitMessage } from './engine.js';
import { DOCTOR_DIFF } from './doctor.js';
import { promptForModel } from './models.js';

function mask(key: string): string {
  return key.length <= 8 ? '****' : `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export interface SetupOutcome {
  provider: string;
  model: string;
  fromEnv: boolean;
}

/**
 * Shared provider setup: pick provider, key, model, verify, save.
 * Single write at the end — a cancelled run never half-saves.
 * Used by `init` and `config set provider`. Returns null on cancel.
 */
export async function runSetupFlow(presetProvider?: string, successOutro?: string): Promise<SetupOutcome | null> {
  let provider = presetProvider;
  if (!provider) {
    const picked = await p.select({
      message: 'AI provider',
      options: Object.values(providers).map((prov) => ({
        value: prov.name,
        label: prov.name,
        hint: process.env[prov.envKey]
          ? pico.green('✓ key in env')
          : KEY_URLS[prov.name] ?? `env: ${prov.envKey}`,
      })),
    });
    if (p.isCancel(picked)) {
      p.outro('Cancelled.');
      return null;
    }
    provider = picked as string;
  }

  const info = providers[provider];
  if (!info) return null;

  const envKey = process.env[info.envKey];
  const prev = loadConfig();
  if (envKey) {
    p.log.step(`Using key from ${info.envKey} (${mask(envKey)}), nothing to paste.`);
  } else if (prev.apiKey && prev.provider === provider) {
    p.log.step(`Saved key found (${mask(prev.apiKey)}). You can keep it or paste a new one.`);
  } else if (KEY_URLS[info.name]) {
    p.log.message(pico.dim(`Get a key: ${KEY_URLS[info.name]}`));
  }

  let apiKey = envKey || '';
  if (!apiKey) {
    const existing = prev.provider === provider ? prev.apiKey || '' : '';
    const input = await p.password({
      message: existing
        ? 'API key (Enter to keep the saved one)'
        : `Paste your ${info.envKey} API key`,
      validate: (val: string) => {
        if (!val.trim() && !existing) return 'API key cannot be empty';
      },
    });

    if (p.isCancel(input)) {
      p.outro('Cancelled.');
      return null;
    }

    apiKey = (input as string).trim() || existing;
    if (!apiKey) {
      p.outro('Cancelled.');
      return null;
    }
  }

  const currentModel = prev.provider === provider && prev.model ? prev.model : info.defaultModel;
  const picked = await promptForModel(provider, currentModel, info.defaultModel);
  if (!picked) return null;
  const modelName = picked;

  // Verify before saving: full path (auth + generation + parsing) on a sample diff.
  const hadEnv = info.envKey in process.env;
  if (!hadEnv) process.env[info.envKey] = apiKey;
  try {
    const spin = p.spinner();
    spin.start('Testing the connection with a sample diff...');
    try {
      const sample = await generateCommitMessage(DOCTOR_DIFF, false, provider, modelName);
      spin.stop('Connected');
      p.log.step(pico.green(sample.subject));
      if (sample.body) {
        p.log.message(sample.body.split('\n').map(l => pico.dim(`  ${l}`)).join('\n'));
      }
    } catch (err) {
      spin.stop('Failed');
      const retry = await p.confirm({
        message: `${pico.red(friendlyProviderError(err))}\nStart over?`,
        initialValue: true,
      });
      if (!p.isCancel(retry) && retry) return runSetupFlow(presetProvider, successOutro);
      p.outro('Cancelled. Nothing saved.');
      return null;
    }
  } finally {
    if (!hadEnv) delete process.env[info.envKey];
  }

  const next = { ...prev };
  next.provider = provider;
  next.model = modelName;
  if (!envKey) {
    next.apiKey = apiKey;
  } else {
    delete next.apiKey;
  }
  saveGlobalConfig(next);

  p.log.step(pico.dim(`Saved: provider=${next.provider} model=${next.model} ${envKey ? `(key from ${info.envKey})` : '(key in ~/.mmit.json)'}`));
  p.outro(pico.green(successOutro ?? 'Ready. Stage changes and run mmit. Try: git add . && mmit'));
  return { provider, model: modelName, fromEnv: !!envKey };
}
