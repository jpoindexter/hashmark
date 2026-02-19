# Hashmark Roadmap

## Overview

Hashmark is the cloud product for hashmark-cli (formerly agent-smith). The CLI is free and generates context files locally. Hashmark SaaS generates ALL AI context file formats, keeps them in sync via GitHub Actions, and provides a codebase intelligence dashboard.

**Domain**: hashmark.md
**CLI**: `npx hashmark-cli` (652 downloads in 3 days, 47% blog post conversion)
**Value prop**: "One scan. Every format. Always in sync."

---

## Phase 1: Foundation [DONE]

### 1.1 Project Setup [DONE]
- [x] Create GitHub repo (jpoindexter/hashmark)
- [x] Initialize Next.js 16 + TypeScript + Tailwind v4
- [x] Install dependencies (Prisma, NextAuth, Octokit, Stripe, Zod)
- [x] Create documentation (README, CLAUDE.md, .env.example)
- [x] Create Prisma schema (8 models, 4 enums)
- [x] Set up directory structure (pnpm workspace monorepo)

### 1.2 Landing Page [DONE]
- [x] Hero section with terminal aesthetic
- [x] "How it works" 3-step section (Connect, Scan, Sync)
- [x] Pricing table (Free / Pro $19/mo / Team $29/seat/mo)
- [x] "Try the CLI free" section with npx command
- [x] Footer with links
- [x] SEO meta tags
- [ ] OG image
- [ ] Mobile responsive polish

### 1.3 Auth + Database [PARTIAL]
- [x] GitHub OAuth via NextAuth v5 (config + route handler)
- [x] Prisma schema (User, Repository, Scan, GeneratedFile, CustomRule)
- [x] User model with plan field (FREE/PRO/TEAM enum)
- [ ] Prisma migration (push to Supabase/Neon)
- [ ] Protected route middleware
- [ ] Sign in / sign out UI pages

### 1.4 Scanner Engine [DONE]
- [x] Move agent-smith into packages/cli/ as hashmark-cli
- [x] 28 scanners fully operational
- [x] Rename all branding from agent-smith → hashmark
- [x] Backwards-compatible config loading

### 1.5 Multi-Format Generators [DONE]
- [x] AGENTS.md (existing generator.ts)
- [x] CLAUDE.md format adapter
- [x] .cursorrules format adapter
- [x] .cursor/rules/*.mdc format adapter (split by domain)
- [x] .github/copilot-instructions.md format adapter
- [x] .windsurfrules format adapter
- [x] GEMINI.md format adapter
- [x] .clinerules format adapter
- [x] CLI `--format all` flag (generates 10 files)
- [x] CLI `--format claude-md,cursorrules` (comma-separated)

### 1.6 GitHub Action [DONE]
- [x] packages/action/ with action.yml
- [x] Auto-sync: scan → generate all formats → commit
- [x] PR mode (`commit-mode: pr`)
- [x] Custom rules injection
- [x] Format selection
- [x] README with usage examples

---

## Phase 2: Codebase Intelligence Dashboard (~1 week)

Build with FABRK framework packages. Dual-purpose: show developers what the AI sees + manage context file generation. Reference model: SonarSource's dashboard for code quality, adapted for AI context.

**Design system**: FABRK integration complete — globals.css has all 25+ CSS variables, mode object works seamlessly. Terminal aesthetic: zinc grays, emerald accent, amber warnings, sharp corners, monospace.

### 2.1 Dashboard Shell
- [ ] Install FABRK packages (design-system, components, auth, payments, security, core)
- [ ] Dashboard layout (sidebar, header, breadcrumbs)
- [ ] Protected routes (require auth)
- [ ] Navigation between pages

### 2.2 Repo Management
- [ ] `/dashboard/repos` — List user's GitHub repos (Octokit)
- [ ] Connect/disconnect repos
- [ ] Repo status indicators (connected, last scan)
- [ ] One-click scan trigger

### 2.3 Codebase Intelligence (Scan Visualization)
- [ ] `/dashboard/[repoId]` — "See what your AI sees" — scan results visualization
- [ ] KPI cards (total files, components found, API routes, complexity score)
- [ ] Component inventory table (name, variants, dependencies, file path)
- [ ] API routes table (path, method, auth status, request/response schema)
- [ ] Complexity heatmap by directory (BarChart)
- [ ] Dependency graph (which files import what)
- [ ] Scanner coverage summary (which of 27 scanners found results)

### 2.4 Format Preview + Download
- [ ] `/dashboard/[repoId]/files` — Preview all 8 formats
- [ ] Syntax-highlighted preview
- [ ] Download individual format
- [ ] Download all as ZIP
- [ ] Copy to clipboard

### 2.5 API Routes
- [ ] `POST /api/scan/[repoId]` — Trigger scan
- [ ] `GET /api/scan/[repoId]/latest` — Latest results
- [ ] `GET /api/repos` — List repos
- [ ] `POST /api/repos/connect` — Connect repo
- [ ] `GET /api/files/[repoId]/[format]` — Get format content
- [ ] `POST /api/action/install` — Install GitHub Action

---

## Phase 3: Payments (~3 days)

### 3.1 Stripe Integration
- [ ] Create Stripe products (Pro, Team)
- [ ] `/pricing` page with checkout CTAs
- [ ] Checkout session creation
- [ ] Webhook handler (invoice.paid, subscription events)
- [ ] `/dashboard/billing` — Plan management, portal link

### 3.2 Feature Gating
- [ ] Free: 1 repo, manual scan, download only
- [ ] Pro: unlimited repos, auto-sync, custom rules, scan history
- [ ] Team: org-wide rules, team dashboard
- [ ] Middleware plan check on protected features

---

## Phase 4: Polish + Launch (~3 days)

### 4.1 UX
- [ ] Loading states (skeleton screens)
- [ ] Empty states (no repos, no scans)
- [ ] Error handling (scan failures, API errors)
- [ ] Toast notifications
- [ ] Mobile responsive

### 4.2 Deploy
- [ ] Deploy to Vercel
- [ ] Connect hashmark.md domain
- [ ] Set up env vars
- [ ] E2E test full flow

### 4.3 Launch
- [ ] Product Hunt submission
- [ ] Hacker News "Show HN"
- [ ] Reddit (r/programming, r/webdev, r/cursor, r/ClaudeAI)
- [ ] dev.to tutorial article
- [ ] GitHub Action on Marketplace

---

## Future Ideas (Post-Launch)

- Custom rules engine (inject rules into all formats)
- AI-readiness score (grade repos for AI tool compatibility)
- Org dashboard (team-wide view)
- Scan history with diffs
- VSCode extension
- Public profiles / README badge
- Self-hosted enterprise version
- Slack notifications
- API access for third-party tools

---

## Key Metrics

- **Activation**: User connects first repo and sees scan results
- **Conversion**: Free user upgrades to Pro
- **Retention**: User keeps repos connected and scanning
- **North star**: Number of repos with active auto-sync (GitHub Action)

## Revenue Targets

| Month | Free Users | Pro ($19/mo) | Team ($29/seat) | MRR |
|-------|-----------|--------------|-----------------|-----|
| 1 | 50 | 5 | 0 | $95 |
| 3 | 200 | 20 | 0 | $380 |
| 6 | 500 | 50 | 2 teams (10 seats) | $1,240 |
| 12 | 2,000 | 200 | 10 teams (50 seats) | $5,250 |
