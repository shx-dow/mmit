import * as p from '@clack/prompts';
import pico from 'picocolors';
import { loadConfig } from './config.js';
import { providers, detectProviderFromEnv, friendlyProviderError } from './provider.js';
import { CliError } from './errors.js';
import { generateCommitMessage } from './engine.js';
import type { GeneratedMessage } from './engine.js';
import { renderCompactHeader } from './logo.js';

/** Tiny canned diff used to prove the full path works without touching any repo. */
export const DOCTOR_DIFF = `diff --git a/src/greet.ts b/src/greet.ts
new file mode 100644
index 0000000..3b18e51
--- /dev/null
+++ b/src/greet.ts
@@ -0,0 +1,3 @@
+export function greet(name: string): string {
+  return \`Hello, \${name}!\`;
+}`;

export interface DoctorOptions {
  provider?: string;
  model?: string;
}

/** Run the end-to-end check. Throws with a friendly message on failure. */
export async function checkConnection(opts: DoctorOptions = {}): Promise<GeneratedMessage> {
  const config = loadConfig();
  const providerName = opts.provider || config.provider || detectProviderFromEnv() || 'openai';
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown provider "${providerName}". Available: ${Object.keys(providers).join(', ')}`);
  }
  const apiKey = process.env[provider.envKey] || config.apiKey;
  if (!apiKey) {
    throw new Error(`No API key for "${providerName}". Run \`mmit init\` to set one up.`);
  }
  const model = opts.model || config.model || provider.defaultModel;
  try {
    return await generateCommitMessage(DOCTOR_DIFF, false, providerName, model);
  } catch (err) {
    throw new Error(friendlyProviderError(err));
  }
}

export async function handleDoctor(opts: DoctorOptions): Promise<void> {
  process.stderr.write(renderCompactHeader('doctor') + '\n');
  p.intro('Checking your mmit setup, no repos will be touched.');

  const spin = p.spinner();
  spin.start('Sending a sample diff to your provider...');
  try {
    const msg = await checkConnection(opts);
    spin.stop('Done');
    p.log.step(pico.green(msg.subject));
    if (msg.body) {
      p.log.message(msg.body.split('\n').map(l => pico.dim(`  ${l}`)).join('\n'));
    }
    p.outro(pico.green(`Healthy · ${msg.provider} · ${msg.model}`));
  } catch (err) {
    spin.stop('Failed');
    throw new CliError(err instanceof Error ? err.message : String(err));
  }
}
