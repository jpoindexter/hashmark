# Hashmark — Product Specification

## One-Liner

Hashmark scans your codebase and auto-generates AI context files for every coding tool.

## Tagline

"One scan. Every format. Always in sync."

## The Problem

Every AI coding tool has its own context file format. Developers must maintain up to 7 different files — all containing essentially the same information about their codebase:

1. **AGENTS.md** — Universal standard (Linux Foundation, 20K+ repos)
2. **CLAUDE.md** — Claude Code (Anthropic)
3. **.cursorrules** — Cursor (legacy)
4. **.cursor/rules/*.mdc** — Cursor (new MDC format)
5. **.github/copilot-instructions.md** — GitHub Copilot
6. **.windsurfrules** — Windsurf
7. **gemini.md** — Google Gemini CLI

Pain points:
- **Nobody maintains them.** Files get written once and go stale.
- **They drift out of sync.** AGENTS.md says one thing, .cursorrules says another.
- **Manual authoring is tedious.** Documenting every component, API route, and pattern by hand.
- **Context fragmentation.** Sentry opened a GitHub issue about migrating between formats.

## The Solution

Hashmark automates the entire workflow:

1. **Connect** your GitHub repos (OAuth, one click)
2. **Scan** with 27 specialized scanners that extract components, APIs, patterns, database schemas, complexity metrics, design tokens, hooks, tests, anti-patterns, and more
3. **Generate** all 7 file formats from a single scan
4. **Sync** automatically via GitHub Action — on every push, context files are regenerated and auto-committed

Zero friction. No PRs to review. No manual updates. Every AI tool always has fresh context.

## User Personas

### Solo Developer ($19/mo Pro)
- Ships side projects and SaaS apps
- Uses 2-3 AI coding tools (Cursor + Claude Code is common)
- Pain: manually writing .cursorrules and CLAUDE.md, they go stale within days
- Value: "I connect my repo once and never think about it again"

### Engineering Manager ($29/seat/mo Team)
- 5-20 person team using AI tools
- Pain: inconsistent AI output across team, no standardized context
- Value: "Every developer on the team gets the same AI context, automatically"

### Library/Framework Author (Pro or Team)
- Publishes packages consumed by other developers
- Pain: AI tools don't know how to use their library correctly
- Value: "My AGENTS.md tells AI exactly how to use my library — always up to date"

## Competitive Landscape

| Competitor | What They Do | How Hashmark Differs |
|------------|-------------|---------------------|
| **Repomix** | Packs code into single file for LLM context | One format only, manual, no auto-sync |
| **Context7** | Library docs via MCP | Library docs only, not project-specific context |
| **SpecStory** | Learns from Cursor chat history | Cursor-only, reactive not proactive |
| **agent-smith CLI** | Our CLI, generates AGENTS.md | AGENTS.md only, manual run, no cloud |

Hashmark's moat: **all formats, auto-synced, zero friction.**

## How Auto-Sync Works

### GitHub Action Approach (No Server Needed)

```
User installs Hashmark GitHub Action (one-time setup)
    ↓
On every push to main branch:
    ↓
GitHub Action runs in the repo's CI environment
    ↓
Runs agent-smith's 27 scanners on the codebase
    ↓
Generates all 7 context file formats
    ↓
Compares with existing files
    ↓
If changed → auto-commits updated files to main
If unchanged → does nothing
```

Benefits:
- No scanning server on our side (runs in GitHub CI)
- Scales to any number of repos (each repo runs its own Action)
- Zero friction (auto-commit, no PR review needed)
- Configurable: `mode: pr` for teams that want review

## What the 27 Scanners Extract

| Category | Scanners |
|----------|----------|
| **UI** | Components, variants (CVA), dependencies, barrels, design tokens |
| **Code** | Hooks, utilities, patterns, types, anti-patterns |
| **API** | API routes, request/response schemas (Zod), GraphQL schemas |
| **Data** | Database models (Prisma/Drizzle), environment variables |
| **Quality** | Tests, security audit, cognitive complexity |
| **Structure** | File tree, import graph (hub files, circular deps), statistics |
| **Context** | Framework detection, existing docs (CLAUDE.md, .cursorrules), commands |
| **Git** | Recent commits, uncommitted changes, monorepo packages |

## Pricing Strategy

### Free Tier (Acquisition)
- 1 connected repo
- Manual scan via web UI
- Download all 7 formats
- Basic dashboard
- Purpose: Try it, see value, upgrade

### Pro Tier — $19/month (Individuals)
- Unlimited repos
- Auto-sync via GitHub Action
- Full codebase intelligence dashboard
- Custom rules
- Scan history with diffs
- Purpose: Solo devs and small teams

### Team Tier — $29/seat/month (Teams)
- Everything in Pro
- Org-wide rules across all repos
- Team dashboard (all repos in one view)
- Invite team members
- Shared custom rules library
- Purpose: Engineering teams standardizing AI usage

### Why These Prices
- **$19/mo**: Less than a GitHub Copilot seat ($10-19/mo), comparable value
- **$29/seat/mo**: Enterprise pricing that scales, below SonarQube Cloud ($14+/mo base)
- Free tier is generous enough to demonstrate value, restricted enough to drive upgrades

## Technical Architecture

```
Browser → Next.js App (Vercel)
              ├── NextAuth (GitHub OAuth)
              ├── Prisma (Postgres on Supabase/Neon)
              ├── Stripe (subscriptions)
              └── Octokit (GitHub API)
                    ├── List repos
                    ├── Create/update files (auto-commit)
                    └── Create workflow files (Action install)

GitHub Action (runs in user's repo CI)
    └── agent-smith CLI (27 scanners)
         └── Generates all 7 file formats
         └── Auto-commits to repo
```

No scanning server needed. All compute runs in GitHub Actions (the user's own CI minutes).

## Key Metrics

| Metric | Definition | Target (Month 1) |
|--------|-----------|-------------------|
| **Signups** | GitHub OAuth completions | 100 |
| **Activation** | Connected first repo + viewed scan | 50 |
| **Conversion** | Upgraded to Pro or Team | 5-10 |
| **MRR** | Monthly recurring revenue | $95-190 |
| **Repo Sync** | Repos with active GitHub Action | 20 |

## Go-to-Market

1. **Blog post** on dev.to / hashnode about the fragmentation problem (like the agent-smith post that drove 560 downloads at 47% conversion)
2. **Hacker News** launch post
3. **Twitter/X** thread showing before/after
4. **GitHub** — star the repo, link from agent-smith CLI output
5. **CLI upsell** — agent-smith CLI shows "Upgrade to Hashmark for auto-sync" after generating AGENTS.md

## Success Criteria (Month 1)

- [ ] Landing page live at hashmark.md
- [ ] Can sign up with GitHub OAuth
- [ ] Can connect repos and run scans
- [ ] All 7 file formats generate correctly
- [ ] GitHub Action auto-syncs on push
- [ ] Stripe checkout works
- [ ] 50+ free signups
- [ ] 5+ paying customers
