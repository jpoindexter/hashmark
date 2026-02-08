```
╻ ╻┏━┓┏━┓╻ ╻┏┳┓┏━┓┏━┓╻┏
┣━┫┣━┫┗━┓┣━┫┃┃┃┣━┫┣┳┛┣┻┓
╹ ╹╹ ╹┗━┛╹ ╹╹ ╹╹ ╹╹┗╸╹ ╹
```

# Hashmark

> One scan. Every format. Always in sync.

**[hashmark.md](https://hashmark.md)**

---

Hashmark scans your codebase and generates AI context files for every coding tool — AGENTS.md, CLAUDE.md, .cursorrules, copilot-instructions, and more. Connect your GitHub repos and they stay in sync automatically.

## The Problem

AI coding tools work better with context files, but every tool has its own format:

| File | Tool |
|------|------|
| `AGENTS.md` | Cursor, Copilot, Gemini, Zed, 20+ tools |
| `CLAUDE.md` | Claude Code |
| `.cursor/rules/*.mdc` | Cursor (new format) |
| `.cursorrules` | Cursor (legacy) |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf |
| `gemini.md` | Gemini CLI |

Maintaining 7 files with the same content is painful. They drift out of sync. They get stale. Nobody updates them after initial setup.

## How It Works

1. **Connect** — Sign in with GitHub, select your repos
2. **Scan** — 27 scanners analyze your codebase (components, APIs, patterns, database, complexity, tokens, hooks, tests, and more)
3. **Sync** — Every format auto-generated and auto-committed via GitHub Action on every push

No PRs to review. No manual updates. Every AI tool gets fresh context automatically.

## Try the CLI Free

```bash
npx @jpoindexter/agent-smith
```

The [agent-smith CLI](https://www.npmjs.com/package/@jpoindexter/agent-smith) generates AGENTS.md locally for free. Hashmark is the cloud product that handles all formats and keeps them in sync.

## Pricing

| | Free | Pro $19/mo | Team $29/seat/mo |
|---|---|---|---|
| Repos | 1 | Unlimited | Unlimited |
| Manual scan via web UI | Yes | Yes | Yes |
| Auto-sync via GitHub Action | — | Yes | Yes |
| All 7 output formats | Yes | Yes | Yes |
| Codebase intelligence dashboard | Basic | Full | Full |
| Custom rules | — | Yes | Yes |
| Scan history | — | Yes | Yes |
| Org-wide rules | — | — | Yes |
| Team dashboard (all repos) | — | — | Yes |

## Development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

See [ROADMAP.md](./docs/ROADMAP.md) for the full build plan.

## License

Proprietary

---

A [theft.studio](https://theft.studio) project
