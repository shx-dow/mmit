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
