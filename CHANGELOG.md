## v0.6.0 (2026-09-23)

### Added

- **models:** Catalog-backed model picker
  - models.dev list for the selected provider only: short list, fuzzy filter, arrows
  - Same clack look, offline cache/default fallback; saves to config as before
- **config:** Mmit config get/set command
  - config, get <key>, set <key> <value> with validation; keys masked on display
- **onboarding:** Postinstall banner, doctor check and guided init
  - postinstall prints next steps (TTY only, silent in CI, never prompts)
  - mmit doctor proves auth+generation+parsing on a sample diff, touches nothing
  - init explains purpose, links key pages, verifies before saving, retries on failure
- **composer:** Validate subject and edit body in editor
  - Inline subject edit validates type, format and length with char count
  - Body opens $EDITOR on a temp file (multiline); empty save removes, cancel keeps
  - Falls back to inline prompt when no TTY; drops the two-step confirm
- **composer:** Guided regenerate with variation
  - Ask direction on regenerate (angle/shorter/type/scope/body/custom)
  - Bump temperature per attempt and avoid previous subjects in prompt

### Fixed

- **provider:** Outage-aware retry and friendly errors
  - 3 tries with 1s/2s/4s backoff on transient errors; auth fails fast
  - Plain-language errors with next steps in flow, composer and init
- Harden git execution, config, providers and release flow
  - Run git via argv (execFileSync) with GitError + gitOptional; fix commit/amend/tag/log injection
  - Validate config (no crash on bad JSON, warn on invalid values, no cache mutation)
  - Provider 30s timeout, surface OpenRouter errors, explicit provider wins
  - Engine validates type against commitTypes, fixes fence-strip, retries transient failures
  - Release always clean-checks, stages only package.json + CHANGELOG.md, uses path.join

### Changed

- **cli:** Throw CliError instead of process.exit in library
  - Single choke point in index runCommand; bin only a safety net
  - Adds cli-errors tests for previously untestable failure paths
- **setup:** Share provider flow between init and config
  - runSetupFlow: pick provider, key, model, verify, single write at end
  - config set provider chains the same steps; init is a thin wrapper
- **cli:** Compact header and single-card preview
  - One-line mmit header for daily runs; pixel logo stays on init
  - Merge stats and provider info into one status line; green type in preview
- Ignore local misc directory
- Add vitest with provider registry and history tests
- **cli:** Route all commands through commander dispatch
- **flow:** Unify commit and amend into a shared flow
- **history:** Extract conventional-commit history module
- **provider:** Consolidate provider metadata into one registry

## v0.5.0 (2026-08-05)

### Added

- **cli:** Allow editing of commit body during interactive flow

### Changed

- **composer:** Extract interactive commit/amend logic
  - Consolidate redundant interactive loops in `index.ts` and `amend.ts` into a single `runComposer` utility.
  - Improve user experience by allowing body editing during the manual edit flow.
  - Reduce code duplication and simplify maintenance of the commit message generation interface.

## v0.4.0 (2026-07-25)

### Added

- **cli:** Add `amend` command
  - Implement interactive commit amending using AI-generated messages
  - Allow users to stage unstaged changes or regenerate messages for the last commit
  - Add `amendCommit` and `getLastCommitDiff` utilities to `git.ts`
  - Integrate `handleAmend` into the main CLI entry point

### Documentation

- **readme:** Improve documentation and project metadata
  - Enhance README layout with badges, tables, and better formatting for readability
  - Add repository and homepage fields to package.json to improve package discoverability

## v0.3.0 (2026-07-23)

### Added

- **changelog:** Add compact mode for changelog generation
  - Introduce a `--compact` option to generate a concise changelog format
  - Use short git hashes in compact mode to reduce output verbosity
  - Update CLI and release handlers to support the new flag

## v0.2.1 (2026-07-19)

### Changed

- **changelog:** Include maintenance commits in release notes
  - Ensure chore, ci, build, test, and style commits are captured in the changelog under the 'changed' section
  - Enable verbose mode for changelog generation to improve debugging during release processes
- **logo:** Sync version with package.json
  - Automate version management by reading the version directly from package.json
  - Eliminate the need to manually update the version string in the source code during releases

## v0.2.0 (2026-07-19)

### Added

- **release:** Add automated release command
  - Introduce `mmit release` to automate version bumping, changelog generation, and tagging.
  - Implement automatic semantic version detection based on conventional commit history.
  - Refactor logo rendering and version management into a shared module.
  - Add support for dry-run mode to preview release changes.
- **changelog:** Add automated changelog generation
  - Implement `generateChangelog` utility to parse git history and format commits into Markdown
  - Add `changelog` command to the CLI to support generating and writing changelog files
  - Support filtering by commit range, tags, and verbosity levels
  - Enable grouping of commits by conventional type (feat, fix, etc.) and support for breaking changes
- **git:** Add support for detecting and handling unstaged changes

### Changed

- **git:** Restrict diff operations to staged changes
  - Simplify diff retrieval logic to focus exclusively on cached changes
  - Remove fallback mechanisms for unstaged changes to ensure consistent behavior
  - Update status parsing logic to correctly identify modified files in the git status output

### Documentation

- **readme:** Update project documentation screenshots
  - Replace placeholder screenshot URLs with actual image assets
  - Improve alignment of changelog command examples for better readability

## v0.1.0 (2026-07-18)

### Added

- **ui:** Enhance documentation and CLI presentation
  - Add ASCII logo to CLI output for better branding
  - Update README with comprehensive usage examples and configuration details
  - Improve configuration security by masking API keys when running `--config`
  - Refine commit message generation prompt to better enforce conventional commit standards
  - Update commit validation regex to support breaking change indicators and complex scopes
- **engine:** Support multi-line commit messages
  - Update  interface to include optional
  - Refactor  to  for parsing multi-line output
  - Update  to support optional body parameter
  - Enhance interactive CLI to display and select commit body content
  - Increase  for LLM requests to accommodate longer messages
- **config:** Add support for local API keys and init command
- **cli:** Add diff statistics and improve commit confirmation flow
- Add AI-powered git commit message generator with multi-provider support

### Fixed

- **git:** Improve shell escaping and log formatting
  - Update `createCommit` to escape backticks, dollar signs, and backslashes
  - Refactor log output to prevent unnecessary empty lines in the CLI output

### Changed

- **config:** Support preferred provider and centralize env key map

### Documentation

- **readme:** Update documentation and project configuration
  - Add installation, setup, and usage instructions to README
  - Rename package to @shxd/mmit
  - Add git repository validation check
  - Configure pnpm workspace and local link overrides
