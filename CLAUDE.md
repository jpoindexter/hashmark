# CLAUDE.md

## Project

Hashmark (hashmark.md) — SaaS that scans codebases and generates AI context files for every coding tool. One scan, every format, always in sync.

**CLI**: `hashmark-cli` (652 downloads in 3 days from 1 Reddit post). Scanner engine lives in `packages/cli/`.
**GitHub Action**: `packages/action/` — auto-sync context files on every push.
**Web App**: Next.js 16 app at root `src/` — landing page built, dashboard next.

## Commands

```bash
pnpm dev          # Start dev server (Next.js 16 + Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm db:push      # Push Prisma schema to database
pnpm db:generate  # Generate Prisma client
pnpm db:studio    # Open Prisma Studio

# CLI (scanner engine)
cd packages/cli && pnpm build    # Build CLI
node dist/cli.js                 # Run locally
node dist/cli.js --format all    # Generate all 8 formats
node dist/cli.js --format claude-md,cursorrules  # Specific formats
```

## Stack

- **Next.js 16.1.6** (App Router) + TypeScript 5.9 + Tailwind v4
- **Prisma 6** + Postgres (Supabase/Neon)
- **NextAuth v5** (GitHub OAuth)
- **Stripe** (subscriptions, API v2026-01-28)
- **Octokit** (GitHub API)
- **hashmark-cli** (scanner engine, 27 scanners, in `packages/cli/`)

## Architecture

```
hashmark/
├── src/                          # Next.js web app
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── api/auth/             # NextAuth routes
│   │   └── layout.tsx            # Root layout
│   ├── components/landing/       # 6 landing page components
│   └── lib/
│       ├── auth.ts               # NextAuth config
│       ├── db.ts                 # Prisma client
│       ├── stripe.ts             # Stripe client
│       └── github.ts             # GitHub API helpers
├── prisma/schema.prisma          # 8 models + 4 enums
├── packages/
│   ├── cli/                      # Scanner engine (was agent-smith)
│   │   ├── src/cli.ts            # CLI entry (868 lines)
│   │   ├── src/generator.ts      # AGENTS.md generator (1,274 lines)
│   │   ├── src/formats/          # Multi-format generators (8 formats)
│   │   │   ├── index.ts          # Factory + types
│   │   │   ├── claude-md.ts      # CLAUDE.md
│   │   │   ├── cursor-rules.ts   # .cursorrules
│   │   │   ├── cursor-mdc.ts     # .cursor/rules/*.mdc
│   │   │   ├── copilot-md.ts     # copilot-instructions.md
│   │   │   ├── windsurf-rules.ts # .windsurfrules
│   │   │   ├── gemini-md.ts      # GEMINI.md
│   │   │   └── cline-rules.ts    # .clinerules
│   │   ├── src/scanners/         # 26 scanner files
│   │   ├── src/types.ts          # TypeScript types (533 lines)
│   │   ├── src/config.ts         # Config loader
│   │   └── src/mcp-server.ts     # MCP server
│   └── action/                   # GitHub Action
│       ├── action.yml            # Action metadata
│       ├── src/index.ts          # Action entry point
│       └── README.md             # Usage docs
└── docs/                         # Product documentation (7 files)
```

## Key Patterns

- **Route Groups**: `(marketing)` for public pages, `(dashboard)` for authenticated
- **Server Components by default**: Only add `"use client"` when needed
- **Server Actions**: For mutations (connect repo, trigger scan)
- **API Routes**: For webhooks (Stripe, GitHub)
- **pnpm workspace**: `packages/*` are separate workspace packages
- **tsup**: CLI and action built with tsup (ESM + DTS)

## Design Rules

- Dark terminal aesthetic — `bg-zinc-950`, `text-zinc-100`, `border-zinc-800`
- Monospace font: `font-mono` everywhere
- Headings: UPPERCASE
- Buttons: UPPERCASE with `>` prefix (e.g., `> CONNECT REPO`)
- Accent: `text-emerald-400` for success, `text-amber-400` for warnings
- Code/terminal output: `bg-zinc-900 border border-zinc-800 rounded-lg`
- The `#` symbol is the brand motif

## Output Formats (8 total)

| File | AI Tool | Generator |
|------|---------|-----------|
| `AGENTS.md` | Universal (20+ tools) | `generator.ts` |
| `CLAUDE.md` | Claude Code | `formats/claude-md.ts` |
| `.cursorrules` | Cursor (legacy) | `formats/cursor-rules.ts` |
| `.cursor/rules/*.mdc` | Cursor (new) | `formats/cursor-mdc.ts` |
| `.github/copilot-instructions.md` | GitHub Copilot | `formats/copilot-md.ts` |
| `.windsurfrules` | Windsurf | `formats/windsurf-rules.ts` |
| `GEMINI.md` | Google Gemini CLI | `formats/gemini-md.ts` |
| `.clinerules` | Cline / Roo Code | `formats/cline-rules.ts` |

## Scanner Engine

27 scanners in `packages/cli/src/scanners/`:
components, variants, dependencies, barrels, tokens, hooks, API routes, API schemas, GraphQL, database, env vars, patterns, utilities, framework, complexity, stats, existing context, file tree, imports, types, anti-patterns, tests, security, commands, monorepo, git, AST schema parsing.

## What's Built

- [x] Scanner engine (27 scanners, moved from agent-smith as hashmark-cli)
- [x] Multi-format generators (8 formats, `--format all` flag)
- [x] GitHub Action (`packages/action/`)
- [x] Landing page (6 components, terminal aesthetic)
- [x] Auth config (NextAuth v5, GitHub OAuth)
- [x] Prisma schema (8 models: User, Repository, Scan, GeneratedFile, CustomRule + NextAuth)
- [x] Stripe client configured
- [x] Product documentation (PRODUCT.md, BUSINESS.md, MARKETING.md, ROADMAP.md, ARCHITECTURE.md, GITHUB_ACTION_SPEC.md, SCANNERS.md)

## What's Next

- [ ] **Dashboard** — `/dashboard`, `/dashboard/repos`, `/dashboard/[repoId]`, `/dashboard/[repoId]/files`, `/dashboard/settings`, `/dashboard/billing`
- [ ] **API Routes** — scan CRUD, repo connect, file download, action install
- [ ] **Payments** — Stripe checkout, webhooks, plan-gating
- [ ] **FABRK integration** — Use @fabrk/components, @fabrk/design-system, @fabrk/auth, @fabrk/payments from `../fabrk-framework/packages/` for the dashboard
- [ ] **Polish + Deploy** — Vercel, hashmark.md domain, OG images

## FABRK Integration Plan

The web dashboard should leverage FABRK framework packages (not yet published to npm — use `file:../fabrk-framework/packages/X` references):

| FABRK Package | Usage |
|---------------|-------|
| `@fabrk/design-system` | `mode` object, design tokens, terminal aesthetic |
| `@fabrk/components` | KPICard, BarChart, DataTable, Badge, Card, Button, Input |
| `@fabrk/auth` | NextAuth adapter, GitHub OAuth, `getSession()` |
| `@fabrk/payments` | Stripe adapter, checkout, portal, webhooks |
| `@fabrk/security` | Rate limiting, CSRF on API routes |
| `@fabrk/core` | `cn()` utility, middleware |

## Docs

- `docs/PRODUCT.md` — Product definition, market research, competitors
- `docs/BUSINESS.md` — Business model, pricing, revenue projections
- `docs/MARKETING.md` — Launch strategy, channels, content plan
- `docs/ROADMAP.md` — Development phases with checkboxes
- `docs/ARCHITECTURE.md` — System architecture, data flow
- `docs/GITHUB_ACTION_SPEC.md` — GitHub Action technical spec
- `docs/SCANNERS.md` — All 27 scanners documented
