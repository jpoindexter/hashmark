# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Also read `AGENTS.md` — auto-generated codebase context (components, models, tokens, complexity scores).

## Project

Hashmark (hashmark.md) — SaaS that scans codebases and generates AI context files for every coding tool. One scan, every format, always in sync.

Three deliverables in one monorepo:
- **Web App** (root `src/`): Next.js 16 App Router — landing page live, dashboard in progress
- **CLI** (`packages/cli/`): `hashmark-cli` scanner engine — 27 scanners, 8 output formats
- **GitHub Action** (`packages/action/`): auto-sync context files on push

## Commands

```bash
# Web App (Next.js)
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build (runs prisma generate first)
pnpm lint             # ESLint (Next.js core-web-vitals + typescript)
pnpm type-check       # TypeScript check (tsc --noEmit)

# Database
pnpm db:push          # Push Prisma schema to Postgres
pnpm db:generate      # Generate Prisma client
pnpm db:studio        # Open Prisma Studio
pnpm db:seed          # Seed database

# CLI (separate workspace package)
cd packages/cli && pnpm build     # Build with tsup (ESM + DTS)
cd packages/cli && pnpm dev       # Watch mode
cd packages/cli && node dist/cli.js --format all  # Run locally, all 8 formats

# GitHub Action (separate workspace package)
cd packages/action && pnpm build  # Build with tsup
```

## Setup

```bash
pnpm install
cp .env.example .env.local   # Then fill in values
pnpm db:push                 # Create database tables
pnpm dev
```

Required env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

## Stack

- **Next.js 16.1.6** (App Router) + TypeScript 5.9 + Tailwind v4
- **Prisma 6** + Postgres (Supabase/Neon)
- **NextAuth v5 beta** (GitHub OAuth, PrismaAdapter) — `src/lib/auth.ts`
- **Stripe** (subscriptions, API v2026-01-28) — `src/lib/stripe.ts`
- **Octokit** (GitHub API) — `src/lib/github.ts`
- **pnpm workspace** — packages are independent, built with tsup

## Architecture

**Web App** (`src/`): Path alias `@/*` → `./src/*`. Prisma singleton at `src/lib/db.ts`. Root layout uses Geist Mono font. ESLint config at `eslint.config.mjs` (flat config). Root tsconfig excludes `packages/` — each package has its own.

**CLI engine** (`packages/cli/`): Entry is `src/cli.ts` (uses `cac` for arg parsing). Scanners in `src/scanners/` each export a scan function. `src/generator.ts` produces AGENTS.md. `src/formats/` has per-tool generators that all consume a `ScanResult` type. The format factory in `src/formats/index.ts` has `generateFormat()` for one format and `generateAllFormats()` for all. Config loaded from `hashmark.config.json` / `.hashmarkrc` / legacy `agentsmith.config.*`.

**Database**: 8 Prisma models — User, Repository, Scan, GeneratedFile, CustomRule + 3 NextAuth models. Enums: Plan (FREE/PRO/TEAM), ScanStatus, FileFormat, RuleScope. Schema at `prisma/schema.prisma`.

## Key Patterns

- **Route Groups**: `(marketing)` for public pages, `(dashboard)` for authenticated
- **Server Components by default**: Only add `"use client"` when needed
- **Server Actions**: For mutations (connect repo, trigger scan)
- **API Routes**: For webhooks (Stripe, GitHub)

## Design Rules

- Dark terminal aesthetic: `bg-zinc-950`, `text-zinc-100`, `border-zinc-800`
- Monospace font: `font-mono` everywhere
- Headings: UPPERCASE
- Buttons: UPPERCASE with `>` prefix (e.g., `> CONNECT REPO`)
- Accent colors: `text-emerald-400` (success), `text-amber-400` (warnings)
- Code/terminal blocks: `bg-zinc-900 border border-zinc-800 rounded-lg`
- The `#` symbol is the brand motif

## Output Formats (8 total)

| Format ID | File | AI Tool |
|-----------|------|---------|
| `agents-md` | `AGENTS.md` | Universal (20+ tools) |
| `claude-md` | `CLAUDE.md` | Claude Code |
| `cursorrules` | `.cursorrules` | Cursor (legacy) |
| `cursor-mdc` | `.cursor/rules/*.mdc` | Cursor (new, multi-file) |
| `copilot-md` | `.github/copilot-instructions.md` | GitHub Copilot |
| `windsurf-rules` | `.windsurfrules` | Windsurf |
| `gemini-md` | `GEMINI.md` | Google Gemini CLI |
| `cline-rules` | `.clinerules` | Cline / Roo Code |

Each generator lives in `packages/cli/src/formats/<name>.ts` and takes `(scan: ScanResult, customRules: string[])`.
