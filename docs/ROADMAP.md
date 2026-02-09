# Hashmark Roadmap

## Overview

Hashmark is the cloud product for agent-smith. The CLI is free and generates AGENTS.md locally. Hashmark is the paid SaaS that generates ALL AI context file formats, keeps them in sync via GitHub Actions, and provides a codebase intelligence dashboard.

**Domain**: hashmark.md
**CLI**: npx @jpoindexter/agent-smith (652 downloads in 3 days, 47% blog post conversion)
**Value prop**: "One scan. Every format. Always in sync."

---

## Phase 1: Foundation (Current)

### 1.1 Project Setup [DONE]
- [x] Create GitHub repo (jpoindexter/hashmark)
- [x] Initialize Next.js 16 + TypeScript + Tailwind v4
- [x] Install dependencies (Prisma, NextAuth, Octokit, Stripe, Zod)
- [x] Create documentation (README, CLAUDE.md, .env.example)
- [x] Create Prisma schema
- [x] Set up directory structure

### 1.2 Landing Page [DONE]
- [x] Hero section with terminal aesthetic
- [x] "How it works" 3-step section (Connect, Scan, Sync)
- [x] Pricing table (Free / Pro $19/mo / Team $29/seat/mo)
- [x] "Try the CLI free" section with npx command
- [x] Footer with links
- [x] SEO meta tags
- [ ] OG image
- [ ] Mobile responsive polish

### 1.3 Auth + Database
- [x] GitHub OAuth via NextAuth v5 (config + route handler)
- [x] Prisma schema (User, Repository, Scan, GeneratedFile, CustomRule models)
- [x] User model with plan field (FREE/PRO/TEAM enum)
- [ ] Prisma schema migration (push to Supabase/Neon)
- [ ] Protected route middleware
- [ ] Sign in / sign out flow (UI pages)

## Phase 2: Core Product

### 2.1 GitHub Integration
- [ ] List user's repos from GitHub API (Octokit)
- [ ] Select/connect repos to Hashmark
- [ ] Store connected repos in database
- [ ] Show repo status (connected, last scan, etc.)

### 2.2 Scanning Engine
- [ ] Run agent-smith as subprocess on cloned repo
- [ ] Parse scan results (JSON output)
- [ ] Store scan results in Postgres
- [ ] Scan status tracking (pending → scanning → completed/failed)
- [ ] Background job processing (scan takes 10-30s)

### 2.3 Output Generation
- [ ] Generate AGENTS.md from scan results
- [ ] Generate CLAUDE.md format
- [ ] Generate .cursorrules format
- [ ] Generate .cursor/rules/*.mdc format
- [ ] Generate .github/copilot-instructions.md format
- [ ] Generate .windsurfrules format
- [ ] Generate gemini.md format
- [ ] Preview each format in web UI
- [ ] Download individual or all formats (ZIP)

## Phase 3: Dashboard

### 3.1 Repo Overview
- [ ] All connected repos in one view
- [ ] Status badges (last scan, file counts, health)
- [ ] Quick actions (rescan, view files, disconnect)

### 3.2 Repo Intelligence
- [ ] KPI cards (files, lines, components, API routes, complexity)
- [ ] Components inventory (searchable, filterable)
- [ ] API routes with request/response schemas
- [ ] Complexity hotspots (which files are hardest for AI)
- [ ] Anti-patterns with WRONG/RIGHT code examples
- [ ] Design tokens inventory
- [ ] Unused components detection
- [ ] Test coverage mapping
- [ ] Import graph (hub files, circular deps)

### 3.3 Scan History
- [ ] Timeline of all scans for a repo
- [ ] Diff between scans (what changed)
- [ ] Trend charts (component count, complexity over time)

## Phase 4: Auto-Sync

### 4.1 GitHub Action
- [ ] Create `hashmark-action` GitHub Action
- [ ] Action runs agent-smith scanners in repo CI
- [ ] Generates all 7 file formats
- [ ] Auto-commits changed files to default branch
- [ ] Configurable: `mode: pr` for teams that want review
- [ ] Publish to GitHub Marketplace

### 4.2 Action Installation Flow
- [ ] "Install Action" button in web UI
- [ ] Generate .github/workflows/hashmark.yml content
- [ ] Create workflow file via GitHub API (Contents API)
- [ ] Show installation status
- [ ] Trigger initial scan after install

### 4.3 Webhook Integration
- [ ] GitHub webhook receiver (push events)
- [ ] Trigger re-scan on push to default branch
- [ ] Update dashboard with latest scan results
- [ ] Notification on scan completion

## Phase 5: Payments

### 5.1 Stripe Integration
- [ ] Create Stripe products (Pro, Team)
- [ ] Checkout flow (select plan → Stripe Checkout)
- [ ] Subscription management (upgrade, downgrade, cancel)
- [ ] Billing portal link
- [ ] Stripe webhook handler (invoice.paid, subscription.updated, etc.)

### 5.2 Feature Gating
- [ ] Free tier: 1 repo, manual scan, download only
- [ ] Pro tier: unlimited repos, auto-sync, full dashboard, custom rules, scan history
- [ ] Team tier: org-wide rules, team dashboard, invite members
- [ ] Middleware to check plan on protected features

## Phase 6: Polish

### 6.1 UX
- [ ] Loading states (skeleton screens)
- [ ] Empty states (no repos, no scans)
- [ ] Error handling (scan failures, API errors)
- [ ] Toast notifications
- [ ] Keyboard shortcuts

### 6.2 SEO + Marketing
- [ ] Meta tags on all pages
- [ ] OG images (dynamic)
- [ ] Blog section (optional, for SEO)
- [ ] Changelog page

### 6.3 Deployment
- [ ] Deploy to Vercel
- [ ] Connect hashmark.md domain
- [ ] Set up environment variables
- [ ] Test full flow end-to-end

---

## Future Ideas (Post-Launch)

- **Custom rules**: "Always use design tokens", "No inline styles", "Use existing components"
- **AI-readiness score**: Grade repos on how well AI tools can work with them
- **Org dashboard**: See all team repos in one view with aggregate stats
- **Slack notifications**: Alert when scans complete or anti-patterns detected
- **VS Code extension**: View Hashmark dashboard inline
- **Public profiles**: Share your repo's AI-readiness score (badge for README)
- **API access**: Let other tools consume your scan data
- **Self-hosted**: Enterprise version that runs on-prem

---

## Key Metrics

- **Activation**: User connects first repo and sees scan results
- **Conversion**: Free user upgrades to Pro
- **Retention**: User keeps repos connected and scanning
- **North star**: Number of repos with active auto-sync

## Revenue Targets

- **Month 1**: Launch, 50 free users, 5 Pro ($95 MRR)
- **Month 3**: 200 free users, 20 Pro ($380 MRR)
- **Month 6**: 500 free users, 50 Pro, 2 Teams ($1,108 MRR)
- **Month 12**: 2000 free users, 200 Pro, 10 Teams ($6,700 MRR)
