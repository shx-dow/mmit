import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig, saveGlobalConfig } from './config.js';
import { providers, KEY_URLS, friendlyProviderError } from './provider.js';
import { generateCommitMessage } from './engine.js';
import { DOCTOR_DIFF } from './doctor.js';
import { renderHeader } from './logo.js';

function mask(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export async function handleInit(): Promise<void> {
  process.stderr.write(renderHeader() + '\n');
  p.intro('mmit turns your staged diffs into conventional commits, this connects your AI provider.');

  const provider = await p.select({
    message: 'AI provider',
    options: Object.values(providers).map((prov) => ({
      value: prov.name,
      label: prov.name,
      hint: process.env[prov.envKey]
        ? pico.green('✓ key in env')
        : KEY_URLS[prov.name] ?? `env: ${prov.envKey}`,
    })),
  });

  if (p.isCancel(provider)) {
    p.outro('Cancelled.');
    return;
  }

  const info = providers[provider as string];
  if (!info) return;

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
      return;
    }

    apiKey = (input as string).trim() || existing;
    if (!apiKey) {
      p.outro('Cancelled.');
      return;
    }
  }

  const model = await p.text({
    message: `Default model for ${provider}`,
    initialValue: prev.provider === provider && prev.model ? prev.model : info.defaultModel,
    placeholder: info.defaultModel,
    validate: (val: string) => {
      if (!val.trim()) return 'Model name cannot be empty';
    },
  });

  if (p.isCancel(model)) return;
  const modelName = (model as string).trim();

  // Verify before saving: full path (auth + generation + parsing) on a sample diff.
  const hadEnv = info.envKey in process.env;
  if (!hadEnv) process.env[info.envKey] = apiKey;
  try {
    const spin = p.spinner();
    spin.start('Testing the connection with a sample diff...');
    try {
      const sample = await generateCommitMessage(DOCTOR_DIFF, false, provider as string, modelName);
      spin.stop('Connected');
      p.log.step(pico.green(sample.subject));
      if (sample.body) {
        p.log.message(sample.body.split('\n').map(l => pico.dim(`  ${l}`)).join('\n'));
      }
    } catch (err) {
      spin.stop('Failed');
      const retry = await p.confirm({
        message: `${pico.red(friendlyProviderError(err))}\nTry a different key?`,
        initialValue: true,
      });
      if (!p.isCancel(retry) && retry) return handleInit();
      p.outro('Cancelled. Nothing saved.');
      return;
    }
  } finally {
    if (!hadEnv) delete process.env[info.envKey];
  }

  const next = { ...prev };
  next.provider = provider as string;
  next.model = modelName;
  if (!envKey) {
    next.apiKey = apiKey;
  } else {
    delete next.apiKey;
  }
  saveGlobalConfig(next);

  p.log.step(pico.dim(`Saved: provider=${next.provider} model=${next.model} ${envKey ? `(key from ${info.envKey})` : '(key in ~/.mmit.json)'}`));
  p.outro(pico.green('Ready. Stage changes and run mmit. Try: git add . && mmit'));
}
