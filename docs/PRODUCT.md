# Hashmark — Product Specification

## One-Liner

Hashmark scans your codebase and auto-generates AI context files for every coding tool.

## Tagline

"One scan. Every format. Always in sync."

## The Problem

### Context File Fragmentation

Every AI coding tool has its own context file format. Between 2023-2026, the ecosystem exploded into 8+ competing formats:

| Format | Tool | Introduced | By |
|--------|------|------------|-----|
| `.cursorrules` | Cursor (legacy) | April 2024 | Anysphere |
| `.github/copilot-instructions.md` | GitHub Copilot | October 2024 | GitHub/Microsoft |
| `.windsurfrules` | Windsurf | November 2024 | Codeium |
| `CLAUDE.md` | Claude Code | February 2025 | Anthropic |
| `.clinerules` | Cline | 2025 | Saoud Rizwan |
| `GEMINI.md` | Gemini CLI | June 2025 | Google |
| `AGENTS.md` | Universal (20+ tools) | August 2025 | OpenAI → Linux Foundation |
| `.cursor/rules/*.mdc` | Cursor (new MDC) | 2025 | Anysphere |

**Sources**: [agents.md](https://agents.md), [Cursor docs](https://cursor.com/docs/context/rules), [GitHub Copilot docs](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot), [Gemini CLI docs](https://geminicli.com/docs/cli/gemini-md/)

### Pain Points

1. **Nobody maintains them.** Files get written once and go stale within days.
2. **They drift out of sync.** AGENTS.md says one thing, .cursorrules says another.
3. **Manual authoring is tedious.** Documenting every component, API route, and pattern by hand.
4. **Format chaos.** Even major projects struggle — Sentry opened [GitHub issue #2739](https://github.com/getsentry/sentry-cli/issues/2739) about migrating between formats.
5. **AI output suffers.** 66% of developers say their #1 frustration is "AI solutions that are almost right, but not quite" (Stack Overflow 2025). Better context files directly fix this.

### Academic Research Confirms the Problem

Multiple peer-reviewed papers have studied context file fragmentation:
- **"Agent READMEs"** (arXiv:2511.12884) — Analyzed 2,303 context files from 1,925 repos. Found build/run commands in 62.3%, implementation details in 69.9%, but security in only 14.5%.
- **"Impact of AGENTS.md"** (arXiv:2601.20404) — Empirical study showing AGENTS.md measurably improves agent execution time and token consumption.
- **"Agentic Coding Manifests"** (arXiv:2509.14744) — Analyzed 253 CLAUDE.md files from 242 repos.

Blog coverage of the fragmentation problem:
- [EveryDev.ai: "AI Agent Rule Files Chaos"](https://www.everydev.ai/p/blog-ai-coding-agent-rules-files-fragmentation-formats-and-the-push-to-standardize)
- [Layer5: "AGENTS.md: One File to Guide Them All"](https://layer5.io/blog/ai/agentsmd-one-file-to-guide-them-all/)
- [EclipseSource: "Mastering Project Context Files for AI Coding Agents"](https://eclipsesource.com/blogs/2025/11/20/mastering-project-context-files-for-ai-coding-agents/)

## The Solution

Hashmark automates the entire workflow:

1. **Connect** your GitHub repos (OAuth, one click)
2. **Scan** with 27 specialized scanners that extract components, APIs, patterns, database schemas, complexity metrics, design tokens, hooks, tests, anti-patterns, and more
3. **Generate** all 8 context file formats from a single scan
4. **Sync** automatically via GitHub Action — on every push, context files are regenerated and auto-committed

Zero friction. No PRs to review. No manual updates. Every AI tool always has fresh context.

### Output Files (All Formats, One Scan)

| File | AI Tool | Notes |
|------|---------|-------|
| `AGENTS.md` | Cursor, Copilot, Gemini, Zed, Windsurf, 20+ tools | Linux Foundation standard, 60K+ repos |
| `CLAUDE.md` | Claude Code | Hierarchical, imports via `@path` syntax |
| `.cursor/rules/*.mdc` | Cursor (new) | MDC format with YAML frontmatter, glob-based rules |
| `.cursorrules` | Cursor (legacy) | Still functional, deprecated in v2.2 |
| `.github/copilot-instructions.md` | GitHub Copilot | GitHub-native, smaller context window |
| `.windsurfrules` | Windsurf | Codeium/Windsurf format |
| `GEMINI.md` | Gemini CLI | Google format, hierarchical loading |
| `.clinerules` | Cline | VS Code extension, 5M+ installs |

## Market Opportunity

### AI Coding Tool Adoption (2025 Stack Overflow Survey)

| Metric | Value | Source |
|--------|-------|--------|
| Developers using/planning AI tools | **84%** (up from 76%) | [SO 2025](https://survey.stackoverflow.co/2025/ai) |
| Professional devs using AI daily | **51%** | [SO 2025](https://survey.stackoverflow.co/2025/ai) |
| GitHub Copilot usage among devs | **68%** | [SO 2025](https://survey.stackoverflow.co/2025/ai) |
| Claude usage among professional devs | **45%** | [SO 2025](https://survey.stackoverflow.co/2025/ai) |
| Developers who distrust AI accuracy | **46%** (only 33% trust it) | [SO 2025](https://survey.stackoverflow.co/2025/ai) |
| #1 frustration: "almost right, not quite" | **66%** of developers | [SO 2025](https://survey.stackoverflow.co/2025/ai) |
| AI writes this % of all code | **41%** | [SO 2025](https://survey.stackoverflow.co/2025/ai) |

### Major Platform Numbers

| Platform | Users/Revenue | Growth | Source |
|----------|--------------|--------|--------|
| **GitHub Copilot** | 4.7M paid subscribers, 20M total users | 75% YoY | [TechCrunch](https://techcrunch.com/2025/07/30/github-copilot-crosses-20-million-all-time-users/) |
| **Cursor** | $1B ARR, 360K+ paying customers | $100M→$1B in 17 months | [Cursor Blog](https://cursor.com/blog/series-d) |
| **Claude Code** | ~$500M+ run-rate, 10x usage since GA | 5.5x revenue increase by July 2025 | [Fortune](https://fortune.com/2026/01/24/anthropic-boris-cherny-claude-code-non-coders-software-engineers/) |
| **Anthropic** | $5B+ ARR, targeting $18B in 2026 | 300K+ business customers | [Seeking Alpha](https://seekingalpha.com/news/4543624) |
| **Windsurf** | 1M+ developers, 8-figure enterprise ARR | 500% growth since early 2024 | [Contrary Research](https://research.contrary.com/company/windsurf) |
| **Cline** | 5M+ installs, 57K GitHub stars | Fastest-growing VS Code AI extension | [Cline Blog](https://cline.bot/blog/5m-installs-1m-open-source-grant-program) |

### Market Size

| Timeframe | AI Coding Tool Market | Source |
|-----------|----------------------|--------|
| 2025 | $6.2-7.7B | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/artificial-intelligence-code-tools-market) |
| 2030 | $24-97.9B | [Grand View Research](https://www.grandviewresearch.com/industry-analysis/ai-code-tools-market-report) |
| CAGR | 23-27% | Multiple sources |

### AGENTS.md Standard Adoption

| Metric | Value | Source |
|--------|-------|--------|
| Repos using AGENTS.md | **60,000+** | [agents.md](https://agents.md/) |
| GitHub stars (agentsmd/agents.md) | **16,000** | [GitHub](https://github.com/agentsmd/agents.md) |
| GitHub stars (openai/agents.md) | **8,800** | [GitHub](https://github.com/openai/agents.md) |
| Tools supporting AGENTS.md | **22+** | [agents.md](https://agents.md/) |
| Managed by | Linux Foundation (Agentic AI Foundation) | [LF Announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) |
| AAIF Platinum Members | AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft, OpenAI | [LF](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) |

**Key gap**: Claude Code does NOT natively support AGENTS.md ([Issue #6235](https://github.com/anthropics/claude-code/issues/6235)). This is why CLAUDE.md remains a separate format — and why generating both is necessary.

## User Personas

### Solo Developer ($19/mo Pro)
- **Who**: Ships side projects and SaaS apps, uses 2-3 AI tools daily
- **Tools**: Cursor + Claude Code (most common combo), sometimes Copilot
- **Pain**: "I wrote a .cursorrules file 3 months ago. It's completely wrong now. My CLAUDE.md doesn't exist."
- **Trigger**: AI keeps generating raw HTML divs when they have 200+ components
- **Value**: "I connect my repo once and never think about it again"
- **Budget**: $10-30/mo for dev tools (already pays for Cursor Pro $20/mo)

### Engineering Manager ($29/seat/mo Team)
- **Who**: 5-20 person team standardizing AI tool usage
- **Tools**: Mix of Cursor, Copilot, Claude Code across team
- **Pain**: "Every developer on my team has different .cursorrules. Half don't have any context files at all."
- **Trigger**: PR reviews where AI code ignores team conventions, design tokens, existing components
- **Value**: "Consistent AI context across every developer and every tool"
- **Budget**: $20-50/seat/mo (already pays for GitHub Enterprise, CI)

### Library/Framework Author (Pro)
- **Who**: Maintainer of popular npm/pip/gem packages
- **Tools**: Multiple (tests in different environments)
- **Pain**: "Users' AI tools keep using my library wrong because they don't understand the API"
- **Trigger**: GitHub issues saying "AI told me to call X but that method doesn't exist"
- **Value**: "My AGENTS.md tells AI exactly how to use my library — always up to date"

## Competitive Landscape

### Direct Competitors

| Competitor | GitHub Stars | npm Downloads/mo | Pricing | What They Do | Hashmark Advantage |
|-----------|------------|-----------------|---------|-------------|-------------------|
| **Repomix** | 21,700 | 188,836 | Free (OSS) | Packs code into single XML for LLM context | One format, no generation, no auto-sync |
| **Context7** | 44,200 | — (MCP) | Free (1K req/mo) / $10/mo | Library docs via MCP server | Library docs only, not project-specific |
| **SpecStory** | — | — (VS Code ext) | Free (local) | Saves AI chat history, derives rules | Cursor-only, reactive, no multi-format |
| **agent-smith CLI** | — | 652 (3 days) | Free (OSS) | Generates AGENTS.md | AGENTS.md only, manual, our own CLI |

### Adjacent Competitors

| Competitor | What They Do | Why Not Competitive |
|-----------|-------------|-------------------|
| **SonarQube** ($5B) | AI Code Assurance — tags AI-generated code, applies stricter quality gates | Code quality, not context. Can autodetect Copilot code only. |
| **Sourcegraph Cody** | Vector embeddings of entire codebase for AI context | Real-time indexing, not file generation. Different approach. |
| **Cursor AI** | Built-in semantic indexing + codebase search | Internal to Cursor only. Doesn't help Claude Code, Copilot, etc. |

### Competitive Moat

**Hashmark's unique position**: All formats, auto-synced, zero friction.

No competitor does all three:
1. **All formats**: Repomix = one format. Context7 = library docs. SpecStory = Cursor only.
2. **Auto-synced**: Nobody auto-commits context files on every push via GitHub Action.
3. **Zero friction**: No PRs to review. No manual steps. Install once, forget forever.

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
Generates all 8 context file formats
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
- No cost to us for compute (user's CI minutes)

## What the 27 Scanners Extract

| Category | Scanners | What They Find |
|----------|----------|----------------|
| **UI** | Components, variants, dependencies, barrels, tokens | 279 components, 5 CVA variant configs, 37 color tokens, barrel import paths |
| **Code** | Hooks, utilities, patterns, types, anti-patterns | Custom hooks, cn() utility, react-hook-form/Zod/Zustand patterns, WRONG/RIGHT examples |
| **API** | Routes, schemas (Zod AST), GraphQL | 46 API routes with methods, auth status, request/response schemas |
| **Data** | Database (Prisma/Drizzle), environment variables | 28 models with fields/relations, 87 env vars (required vs optional) |
| **Quality** | Tests, security audit, cognitive complexity | Test framework, component coverage %, vulnerability count, complexity hotspots |
| **Structure** | File tree, import graph, statistics | Hub files (most imported), circular deps, unused files, 1572 files / 365K lines |
| **Context** | Framework, existing docs, commands, monorepo | Next.js App Router v16, existing CLAUDE.md, npm scripts, workspace packages |
| **Git** | Commits, diffs, branch info | Recent changes, uncommitted work, contributor info |

See [SCANNERS.md](./SCANNERS.md) for detailed documentation of all 27 scanners.

## Pricing Strategy

### Tiers

| | Free | Pro $19/mo | Team $29/seat/mo |
|---|---|---|---|
| Connected repos | 1 | Unlimited | Unlimited |
| Manual scan via web UI | Yes | Yes | Yes |
| Auto-sync via GitHub Action | — | Yes | Yes |
| All 8 output formats | Yes | Yes | Yes |
| Download all formats | Yes | Yes | Yes |
| Codebase intelligence dashboard | Basic | Full | Full |
| Custom rules | — | Yes | Yes |
| Scan history with diffs | — | Yes | Yes |
| Org-wide rules | — | — | Yes |
| Team dashboard (all repos) | — | — | Yes |
| Invite team members | — | — | Yes |

### Why These Prices

| Reference | Price | Comparison |
|-----------|-------|------------|
| GitHub Copilot Individual | $10/mo | Hashmark is complementary, makes Copilot work better |
| GitHub Copilot Business | $19/mo | Same price point, different value |
| Cursor Pro | $20/mo | Same buyer, additive value |
| Context7 Pro | $10/mo | More features, higher price justified |
| SonarQube Cloud | $14+/mo base | Different category, similar buyer |

Free tier is generous enough to demonstrate value (all formats, download), restricted enough to drive upgrades (1 repo, no auto-sync).

## Key Metrics

| Metric | Definition | Target (Month 1) | Target (Month 6) |
|--------|-----------|-------------------|-------------------|
| **Signups** | GitHub OAuth completions | 100 | 1,000 |
| **Activation** | Connected first repo + viewed scan | 50% of signups | 60% of signups |
| **Conversion** | Upgraded to Pro or Team | 5-10% | 10-15% |
| **MRR** | Monthly recurring revenue | $95-190 | $1,240 |
| **Repos synced** | Repos with active GitHub Action | 20 | 200 |
| **Churn** | Monthly Pro/Team cancellations | <5% | <3% |

## Go-to-Market

### Distribution Channels (Priority Order)

1. **CLI → Cloud funnel**: agent-smith CLI (652 downloads in 3 days) → Hashmark upsell in CLI output → free signup → Pro upgrade
2. **Blog posts**: First post converted 47% of readers. Plan 6 posts in first 2 months targeting dev.to, Hashnode, Hacker News.
3. **Hacker News**: Show HN launch post. Topic is highly relevant to HN audience.
4. **Twitter/X**: Data threads ("I scanned 100 repos, only 3% had up-to-date context files")
5. **GitHub Action Marketplace**: Discoverable by developers searching for "AI context" actions
6. **README badges**: AI Context Status badge for repos (viral distribution)

See [MARKETING.md](./MARKETING.md) for full go-to-market plan.

## Success Criteria (Month 1)

- [ ] Landing page live at hashmark.md
- [ ] Can sign up with GitHub OAuth
- [ ] Can connect repos and run scans
- [ ] All 8 file formats generate correctly
- [ ] GitHub Action auto-syncs on push
- [ ] Stripe checkout works
- [ ] 50+ free signups
- [ ] 5+ paying customers
- [ ] First blog post published
- [ ] agent-smith CLI shows Hashmark upsell
