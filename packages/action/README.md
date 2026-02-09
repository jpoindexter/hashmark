# Hashmark GitHub Action

**One scan. Every format. Always in sync.**

Automatically generate and sync AI context files for every coding tool on every push.

## Quick Start

Add this to `.github/workflows/hashmark.yml` in your repo:

```yaml
name: Sync AI Context
on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jpoindexter/hashmark@v1
```

That's it. On every push to main, hashmark will:
1. Scan your codebase with 27 scanners
2. Generate context files for every AI tool
3. Auto-commit them back to your repo

## Generated Files

| File | AI Tool |
|------|---------|
| `AGENTS.md` | Universal (Cursor, Copilot, Gemini, Zed, 20+) |
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor (legacy) |
| `.cursor/rules/*.mdc` | Cursor (new format) |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf |
| `GEMINI.md` | Google Gemini CLI |
| `.clinerules` | Cline / Roo Code |

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `formats` | Which formats to generate (`all`, or comma-separated list) | `all` |
| `commit-mode` | `auto` (direct commit) or `pr` (pull request) | `auto` |
| `commit-message` | Custom commit message | Auto-generated |
| `compact` | Smaller output with fewer details | `false` |
| `custom-rules` | Newline-separated rules to inject into all formats | |

## Outputs

| Output | Description |
|--------|-------------|
| `files-generated` | Number of files generated |
| `formats-generated` | Comma-separated list of formats |
| `files-changed` | Whether any files actually changed |

## Examples

### Only generate CLAUDE.md and .cursorrules

```yaml
- uses: jpoindexter/hashmark@v1
  with:
    formats: 'claude-md,cursorrules'
```

### Create a PR instead of auto-committing

```yaml
- uses: jpoindexter/hashmark@v1
  with:
    commit-mode: 'pr'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Add custom rules

```yaml
- uses: jpoindexter/hashmark@v1
  with:
    custom-rules: |
      Always use pnpm, never npm
      Use Tailwind CSS for all styling
      Prefer Server Components in Next.js
```

## License

MIT
