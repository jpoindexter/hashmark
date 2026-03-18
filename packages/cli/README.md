# hashmark

Scan your codebase once. Get AI context files for every tool — `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.clinerules`, and more.

## Install

```bash
# No install required
npx hashmark

# Or globally
npm install -g hashmark
```

## Quickstart

```bash
# 1. Run in your project
npx hashmark

# 2. Preview without writing files
npx hashmark --dry-run

# 3. Force regenerate all formats
npx hashmark --force
```

That's it. Files are written to your project root.

## Output Formats

One scan generates all 8 formats simultaneously:

| File | Tool |
|------|------|
| `AGENTS.md` | Universal — Cursor, Copilot, Gemini, Zed, 20+ |
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor (legacy) |
| `.cursor/rules/*.mdc` | Cursor (MDC — splits rules by domain) |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf / Codeium |
| `GEMINI.md` | Gemini CLI |
| `.clinerules` | Cline / Roo Code |

Generate a single format:

```bash
hashmark --format agents-md
hashmark --format claude-md
hashmark --format cursorrules
hashmark --format cursor-mdc
hashmark --format copilot-md
hashmark --format windsurf-rules
hashmark --format gemini-md
hashmark --format cline-rules
```

## CLI Reference

```
hashmark [dir] [options]

Arguments:
  dir                   Directory to scan (default: current directory)

Options:
  --format <id>         Generate a specific format only (see formats above)
  --output <path>       Output directory (default: scan directory)
  --force               Overwrite existing files
  --dry-run             Preview output without writing files
  --compact             Shorter output — fewer tokens
  --json                Also write .hashmark/index.json relationship graph
  --security            Include security audit section
  -y, --yes             Non-interactive — skip all prompts
  -h, --help            Show help
  --version             Show version
```

## GitHub Action

Keeps your context files in sync on every push to `main`:

```yaml
# .github/workflows/hashmark-scan.yml
name: Hashmark — Update AI Context Files

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

jobs:
  hashmark:
    name: Regenerate AI context files
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - run: npm install -g hashmark

      - run: hashmark --force

      - run: |
          git config --local user.email "hashmark-bot@users.noreply.github.com"
          git config --local user.name "Hashmark Bot"
          git add \
            AGENTS.md \
            CLAUDE.md \
            GEMINI.md \
            .cursorrules \
            .windsurfrules \
            .clinerules \
            ".cursor/rules/" \
            ".github/copilot-instructions.md" \
            2>/dev/null || true
          git diff --staged --quiet || \
            git commit -m "chore: update AI context files [hashmark] [skip ci]"
          git push
```

No secrets required. Uses `GITHUB_TOKEN` automatically.

## MCP Server

hashmark ships an MCP server that gives Claude Code (and any MCP-compatible tool) direct access to your codebase intelligence — component search, API routes, database models, complexity analysis, and more.

**Claude Code** — add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hashmark": {
      "command": "npx",
      "args": ["hashmark", "mcp"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "hashmark": {
      "command": "hashmark",
      "args": ["mcp"]
    }
  }
}
```

**Available MCP tools:**

| Tool | What it does |
|------|-------------|
| `pack_codebase` | Generate AGENTS.md for a directory |
| `read_agents` | Read existing AGENTS.md |
| `search_components` | Find components by name |
| `get_component_info` | Detailed info on a specific component |
| `scan_api_routes` | API routes with Zod/TypeScript schemas |
| `scan_database` | Prisma/Drizzle models with relations |
| `scan_graphql` | GraphQL schema definitions |
| `analyze_complexity` | Cyclomatic, cognitive, and maintainability metrics |
| `scan_hooks` | Custom React hooks |
| `search_api_routes` | Search routes by path or method |
| `search_database_models` | Search models by name |
| `get_api_route_info` | Full detail on a specific route |
| `get_database_model_info` | Full detail on a specific model |

## Other Commands

```bash
# Watch mode — re-scans on file changes
hashmark watch

# Install Claude Code hooks (auto-regenerate on session start)
hashmark hook install

# Remove hooks
hashmark hook uninstall

# Build .hashmark/index.json relationship graph
hashmark sync
```

## Requirements

- Node.js >= 18

## License

MIT — [hashmark.md](https://hashmark.md)
