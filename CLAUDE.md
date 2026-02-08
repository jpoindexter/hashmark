# CLAUDE.md

## Project

Hashmark (hashmark.md) — SaaS that scans codebases and generates AI context files for every coding tool. One scan, every format, always in sync.

Powered by agent-smith's 27 scanners. The CLI (`npx @jpoindexter/agent-smith`) is free. This is the paid cloud product.

## Commands

```bash
pnpm dev          # Start dev server (Next.js 16 + Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm db:push      # Push Prisma schema to database
pnpm db:generate  # Generate Prisma client
pnpm db:studio    # Open Prisma Studio
```

## Stack

- **Next.js 16** (App Router) + TypeScript 5 + Tailwind v4
- **Prisma** + Postgres (Supabase/Neon)
- **NextAuth v5** (GitHub OAuth)
- **Stripe** (subscriptions)
- **Octokit** (GitHub API)
- **agent-smith** (scanning engine, 27 scanners)

## Architecture

```
src/
├── app/
│   ├── (marketing)/       # Landing page, pricing (public)
│   ├── (dashboard)/       # Dashboard (authenticated)
│   ├── api/
│   │   ├── auth/          # NextAuth routes
│   │   ├── scan/          # Scan API endpoints
│   │   └── webhooks/      # Stripe + GitHub webhooks
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Landing page
├── components/
│   ├── landing/           # Landing page components
│   ├── dashboard/         # Dashboard components
│   └── shared/            # Shared UI (buttons, cards, etc.)
├── lib/
│   ├── auth.ts            # NextAuth config
│   ├── db.ts              # Prisma client
│   ├── stripe.ts          # Stripe client
│   ├── github.ts          # GitHub API helpers
│   └── scanner.ts         # agent-smith scanner wrapper
└── prisma/
    └── schema.prisma      # Database schema
```

## Key Patterns

- **Route Groups**: `(marketing)` for public pages, `(dashboard)` for authenticated
- **Server Components by default**: Only add `"use client"` when needed
- **Server Actions**: For mutations (connect repo, trigger scan)
- **API Routes**: For webhooks (Stripe, GitHub)

## Design Rules

- Dark terminal aesthetic — `bg-zinc-950`, `text-zinc-100`, `border-zinc-800`
- Monospace font: `font-mono` everywhere
- Headings: UPPERCASE
- Buttons: UPPERCASE with `>` prefix (e.g., `> CONNECT REPO`)
- Accent: `text-emerald-400` for success, `text-amber-400` for warnings
- Code/terminal output: `bg-zinc-900 border border-zinc-800 rounded-lg`
- The `#` symbol is the brand motif — use it in headers, loading states, decorative elements

## Output Formats

| File | AI Tool |
|------|---------|
| `AGENTS.md` | Universal (Cursor, Copilot, Gemini, Zed, 20+) |
| `CLAUDE.md` | Claude Code |
| `.cursor/rules/*.mdc` | Cursor (new format) |
| `.cursorrules` | Cursor (legacy) |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf |
| `gemini.md` | Gemini CLI |

## Scanning Engine

Runs agent-smith as a subprocess:
```bash
npx @jpoindexter/agent-smith <path> --json --force
```

27 scanners: components, variants, dependencies, barrels, tokens, hooks, API routes, API schemas, GraphQL, database, env vars, patterns, utilities, framework, complexity, stats, existing context, file tree, imports, types, anti-patterns, tests, security, commands, monorepo, git, AST schema parsing.
