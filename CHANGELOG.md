## Unreleased (2026-07-19)

### Added

- **git:** Add support for detecting and handling unstaged changes

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
