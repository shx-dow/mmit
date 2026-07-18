# mmit

AI-powered conventional commit message generator.

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

Or set an environment variable directly:

| Provider    | Env var             |
|-------------|---------------------|
| OpenAI      | `OPENAI_API_KEY`    |
| Anthropic   | `ANTHROPIC_API_KEY` |
| Gemini      | `GEMINI_API_KEY`    |
| OpenRouter  | `OPENROUTER_API_KEY`|

## Usage

```bash
# stage your changes
git add .

# generate and commit
mmit
```

### Options

| Flag | Description |
|------|-------------|
| `-p, --provider <name>` | Force a specific provider |
| `-m, --model <name>` | Override model |
| `--dry-run` | Generate without committing |
| `--diff-only` | Print the diff and exit |
| `--auto` | Auto-confirm without prompt |

## Config

Global: `~/.mmit.json`  
Project: `.mmit.json` (project root, overrides global)

```json
{
  "provider": "gemini",
  "model": "gemini-3.1-flash-lite",
  "commitTypes": ["feat", "fix", "chore", "refactor", "docs", "style", "test", "perf"]
}
```
