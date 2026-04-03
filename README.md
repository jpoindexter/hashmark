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
| `GEMINI.md` | Gemini CLI |
| `.clinerules` | Cline / Roo Code |

Maintaining 8 files with the same content is painful. They drift out of sync. They get stale. Nobody updates them after initial setup.

## How It Works

1. **Connect** — Sign in with GitHub, select your repos.
2. **Scan** — The **Single-Pass Visitor Engine** analyzes your codebase in < 2 seconds (components, APIs, database, complexity, AI readiness).
3. **Live Stream** — Watch the scan progress in real-time via **SSE (Server-Sent Events)** with a live terminal UI.
4. **Sync** — Every format (AGENTS.md, CLAUDE.md, .cursorrules, etc.) is auto-generated and auto-committed via GitHub Action.

No PRs to review. No manual updates. Every AI tool gets fresh, high-fidelity context automatically.

## Try the CLI Free

```bash
npx hashmark
```

The [hashmark CLI](https://www.npmjs.com/package/hashmark) generates all 8 formats locally for free. Hashmark is the cloud product that keeps them in sync automatically on every push.

## Pricing

| | Free | Pro $19/mo | Team $29/seat/mo |
|---|---|---|---|
| Repos | 1 | Unlimited | Unlimited |
| Manual scan via web UI | Yes | Yes | Yes |
| Auto-sync via GitHub Action | — | Yes | Yes |
| All 8 output formats | Yes | Yes | Yes |
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
