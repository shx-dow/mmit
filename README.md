<div align="center">

# mmit

**AI-powered git workflow tool**

[![npm version](https://img.shields.io/npm/v/@shxd/mmit?style=flat-square&logo=npm)](https://www.npmjs.com/package/@shxd/mmit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

![mmit workflow](https://raw.githubusercontent.com/shx-dow/mmit/main/assets/screenshot-workflow.png)

</div>

---

## Install

```bash
npm install -g @shxd/mmit

# or use directly
npx @shxd/mmit
```

## Setup

```bash
mmit init
```

This walks you through selecting a provider and API key. You can also set an environment variable:

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

---

## Usage

Stage your changes and run:

```bash
git add .
mmit
```

mmit analyzes the diff, generates a conventional commit message, and lets you review, edit, or regenerate before committing.

### Multi-line bodies

When the AI generates a body explaining the change, you can choose to commit with the subject only or include the body.

### Non-interactive mode

```bash
mmit --dry-run    # preview without committing
mmit --auto       # skip the interactive prompt
```

### Options

| Flag | Description |
|------|-------------|
| `-p, --provider <name>` | AI provider (`openai`, `anthropic`, `gemini`, `openrouter`) |
| `-m, --model <name>` | Override the default model |
| `-V, --version` | Print version |
| `--dry-run` | Generate without committing |
| `--auto` | Skip the interactive prompt |
| `--diff-only` | Print the staged diff and exit |
| `--config` | Print the current config |

---

## Changelog

```bash
mmit changelog                           # commits since last tag
mmit changelog --all                     # full changelog for all tags
mmit changelog --write                   # prepend to CHANGELOG.md
mmit changelog --verbose                 # include internal types (chore, ci, etc.)
mmit changelog --from v0.1.0 --to v0.2.0 # custom range
mmit changelog --output RELEASES.md      # custom output path
```

Groups commits into **Added**, **Fixed**, **Changed**, **Documentation**, and **Breaking Changes** sections. Body bullet points appear as sub-items.

<div align="center">

![mmit changelog --all output](https://raw.githubusercontent.com/shx-dow/mmit/main/assets/screenshot-changelog.png)

</div>

## Release

```bash
mmit release                 # auto-detect bump from commits
mmit release patch           # force patch bump
mmit release --dry-run       # preview without making changes
mmit release --no-tag        # skip git tag
```

Auto-detects the bump type from commits since the last tag:

- **Breaking changes** (`!` or `BREAKING CHANGE:`) → **major**
- **New features** (`feat`) → **minor**
- **Everything else** → **patch**

The flow: writes the changelog, bumps `package.json`, commits as `chore(release): v<version>`, and creates a git tag.

<div align="center">

![mmit release --dry-run output](https://raw.githubusercontent.com/shx-dow/mmit/main/assets/screenshot-release.png)

</div>

---

## Configuration

Global: `~/.mmit.json`  
Project: `.mmit.json` in the project root (overrides global)

```json
{
  "provider": "gemini",
  "model": "gemini-3.1-flash-lite",
  "commitTypes": ["feat", "fix", "chore", "refactor", "docs", "style", "test", "perf", "ci", "build", "revert"]
}
```

---

## How it works

1. mmit reads your staged git diff
2. Sends it to the configured AI provider with a conventional commits prompt
3. Parses the response into a subject and optional body
4. Presents the message for review, editing, or regeneration
5. Commits when you confirm

## License

[MIT](LICENSE)
