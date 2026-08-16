import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig, saveGlobalConfig } from './config.js';
import { providers } from './provider.js';
import { renderHeader } from './logo.js';

export async function handleInit(): Promise<void> {
  process.stderr.write(renderHeader() + '\n');
  p.intro('');

  const provider = await p.select({
    message: 'AI provider',
    options: Object.values(providers).map((prov) => ({
      value: prov.name,
      label: prov.name,
      hint: process.env[prov.envKey] ? pico.green('✓ env var set') : `env: ${prov.envKey}`,
    })),
  });

  if (p.isCancel(provider)) {
    p.outro('Cancelled.');
    return;
  }

  const info = providers[provider as string];
  if (!info) return;

  let apiKey = process.env[info.envKey] || '';

  if (!apiKey) {
    const input = await p.password({
      message: `Paste your ${info.envKey} API key`,
      validate: (val: string) => {
        if (!val.trim()) return 'API key cannot be empty';
      },
    });

    if (p.isCancel(input)) {
      p.outro('Cancelled.');
      return;
    }

    apiKey = (input as string).trim();
  }

  const model = await p.text({
    message: `Default model for ${provider}`,
    initialValue: info.defaultModel,
    validate: (val: string) => {
      if (!val.trim()) return 'Model name cannot be empty';
    },
  });

  if (p.isCancel(model)) return;

  const config = loadConfig();
  config.provider = provider as string;
  config.model = (model as string).trim();
  if (apiKey && !process.env[info.envKey]) {
    config.apiKey = apiKey;
  }
  saveGlobalConfig(config);

  p.outro(pico.green(`Config saved to ~/.mmit.json`));
}