```
                    █▓ █▓▄
 ██▀██▀▓▄ ██▀██▀▓▄ ▄▄▄ ██
 ██ ██ ██ ██ ██ ██  ██ ▀██▄
```

# mmit

AI-powered conventional commit message generator. Works with OpenAI, Anthropic, Gemini, and OpenRouter.

```
mmit
```

## Install

```bash
npm install -g @shxd/mmit
```

## Setup

```bash
mmit init
```

This walks you through selecting a provider and API key. Alternatively, set an environment variable:

- **OpenAI** — `OPENAI_API_KEY`
- **Anthropic** — `ANTHROPIC_API_KEY`
- **Gemini** — `GEMINI_API_KEY`
- **OpenRouter** — `OPENROUTER_API_KEY`

## Usage

Stage your changes and run:

```bash
git add .
mmit
```

mmit analyzes the diff, generates a conventional commit message, and lets you review, edit, or regenerate before committing.

### Multi-line bodies

When the AI generates a body explaining the change, you can choose to commit with the subject only or include the body.

### Non-interactive

```bash
mmit --dry-run    # preview without committing
mmit --auto       # skip the interactive prompt
```

## Options

- `-p, --provider <name>` — Use a specific provider (openai, anthropic, gemini, openrouter)
- `-m, --model <name>` — Override the default model
- `--dry-run` — Generate the message without committing
- `--auto` — Skip the interactive review prompt
- `--diff-only` — Print the staged diff and exit
- `--config` — Print the current config

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

## How it works

1. mmit reads your staged git diff
2. Sends it to the configured AI provider with a conventional commits prompt
3. Parses the response into a subject and optional body
4. Presents the message for review, editing, or regeneration
5. Commits when you confirm
