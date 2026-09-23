import { renderHeader } from './logo.js';
import * as p from '@clack/prompts';
import { runSetupFlow } from './setup.js';

export async function handleInit(): Promise<void> {
  process.stderr.write(renderHeader() + '\n');
  p.intro('mmit turns your staged diffs into conventional commits, this connects your AI provider.');
  await runSetupFlow();
}
