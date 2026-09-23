/**
 * Fatal CLI error. Library and command code throw this instead of calling
 * `process.exit()`, so the flows stay testable and exit policy lives in
 * exactly two places: the command wrapper (`src/index.ts`) and `bin/mmit`.
 */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}
