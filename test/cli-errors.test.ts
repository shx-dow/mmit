import { describe, it, expect } from 'vitest';
import { CliError } from '../src/errors.js';
import { handleConfig } from '../src/configCmd.js';
import { handleRelease } from '../src/release.js';

// Before the CliError refactor these calls hit process.exit() and would
// have killed the test runner. Now they throw testable errors.
describe('CliError instead of process.exit', () => {
  it('config get with unknown key throws', async () => {
    await expect(handleConfig(['get', 'bogus'])).rejects.toBeInstanceOf(CliError);
  });

  it('config set with unknown key throws', async () => {
    await expect(handleConfig(['set', 'bogus', 'x'])).rejects.toBeInstanceOf(CliError);
  });

  it('config with unknown subcommand throws', async () => {
    await expect(handleConfig(['frobnicate'])).rejects.toBeInstanceOf(CliError);
  });

  it('release with invalid bump throws', async () => {
    await expect(handleRelease({ bump: 'sideways' })).rejects.toBeInstanceOf(CliError);
  });

  it('CliError carries an exit code', () => {
    expect(new CliError('nope').exitCode).toBe(1);
    expect(new CliError('nope', 2).exitCode).toBe(2);
  });
});
