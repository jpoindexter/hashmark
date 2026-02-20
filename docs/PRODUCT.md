# Hashmark — Product Specification

## One-Liner

Hashmark scans your codebase and auto-generates AI context files for every coding tool.

## Tagline

"One scan. Every format. Always in sync."

## The Problem

### Context File Fragmentation

Every AI coding tool has its own context file format. Between 2024-2026, the ecosystem exploded into 10+ competing formats:

| Format | Tool | Introduced | By | Notes |
|--------|------|------------|-----|-------|
| `.cursorrules` | Cursor (legacy) | April 2024 | Anysphere | Deprecated in v2.2, still functional |
| `llms.txt` | Website-level LLM context | September 2024 | Jeremy Howard (Answer.AI) | Proposed standard, not repo-level |
| `.github/copilot-instructions.md` | GitHub Copilot | October 29, 2024 | GitHub/Microsoft | Announced at GitHub Universe '24; also supports `.github/instructions/*.instructions.md` for path-specific rules |
| `.windsurfrules` | Windsurf (legacy) | November 2024 | Codeium | Modern: `.windsurf/rules/*.md` (Wave 8+) |
| `CLAUDE.md` | Claude Code | February 2025 | Anthropic | Hierarchical: Enterprise > Org > Project > .claude/rules/ > Subdir > User global. Supports `@path` imports. GA with Claude 4 (May 2025) |
| `CONVENTIONS.md` | Aider | 2025 | Paul Gauthier | Via `--conventions-file` flag in `.aider.conf.yml` |
| `.clinerules` | Cline | 2025 | Saoud Rizwan | Also supports `.clinerules/` directory with multiple `.md` files. 5M+ installs, 57K stars |
| `GEMINI.md` | Gemini CLI | June 25, 2025 | Google | Hierarchical loading like CLAUDE.md. All found files concatenated per prompt |
| `AGENTS.md` | Universal (22+ tools) | August 2025 | OpenAI → Linux Foundation (AAIF, Dec 2025) | 60K+ repos, supports nested/hierarchical files |
| `.cursor/rules/*.mdc` | Cursor (new MDC) | 2025 | Anysphere | YAML frontmatter, glob-based rules, 879 community-contributed rule files |

**Sources**: [agents.md](https://agents.md), [Cursor docs](https://cursor.com/docs/context/rules), [GitHub Copilot docs](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot), [Gemini CLI docs](https://geminicli.com/docs/cli/gemini-md/), [Claude Code memory docs](https://code.claude.com/docs/en/memory), [Aider conventions](https://aider.chat/docs/usage/conventions.html), [Cline rules docs](https://docs.cline.bot/features/cline-rules), [llmstxt.org](https://llmstxt.org/)

### Pain Points

1. **Nobody maintains them.** Files get written once and go stale within days.
2. **They drift out of sync.** AGENTS.md says one thing, .cursorrules says another.
3. **Manual authoring is tedious.** Documenting every component, API route, and pattern by hand.
4. **Format chaos.** Even major projects struggle — Sentry opened [GitHub issue #2739](https://github.com/getsentry/sentry-cli/issues/2739) about migrating between formats.
5. **AI output suffers.** 66% of developers say their #1 frustration is "AI solutions that are almost right, but not quite" (Stack Overflow 2025). Better context files directly fix this.

### Academic Research Confirms the Problem

Multiple peer-reviewed papers have studied context file fragmentation:
- **"Agent READMEs"** (arXiv:2511.12884) — Analyzed 2,303 context files from 1,925 repos. Found build/run commands in 62.3%, implementation details in 69.9%, architecture in 67.7%, but security in only 14.5%.
- **"Impact of AGENTS.md"** (arXiv:2601.20404) — Empirical study showing AGENTS.md measurably improves agent execution time and token consumption.
- **"Agentic Coding Manifests"** (arXiv:2509.14744) — Analyzed 253 CLAUDE.md files from 242 repos.
- **"Context Engineering for AI Agents in Open-Source Software"** (arXiv:2510.21413) — First holistic empirical study analyzing context files across different AI agents in OSS projects.

Blog coverage of the fragmentation problem:
- [EveryDev.ai: "AI Agent Rule Files Chaos"](https://www.everydev.ai/p/blog-ai-coding-agent-rules-files-fragmentation-formats-and-the-push-to-standardize) — "the ecosystem of rule files is totally fragmented... none of them talk to each other"
- [Layer5: "AGENTS.md: One File to Guide Them All"](https://layer5.io/blog/ai/agentsmd-one-file-to-guide-them-all/) — Describes the fragmentation as a "digital Tower of Babel"
- [EclipseSource: "Mastering Project Context Files for AI Coding Agents"](https://eclipsesource.com/blogs/2025/11/20/mastering-project-context-files-for-ai-coding-agents/)
- [Kaushik Gopal: "Keep your AGENTS.md in sync"](https://kau.sh/blog/agents-md/) — Proposes solutions for single source of truth
- [GitHub Blog: "How to Write a Great agents.md"](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) — Analyzed 2,500+ AGENTS.md files for best practices

## The Solution

Hashmark automates the entire workflow:

1. **Connect** your GitHub repos (OAuth, one click)
2. **Scan** with 27 specialized scanners that extract components, APIs, patterns, database schemas, complexity metrics, design tokens, hooks, tests, anti-patterns, and more
3. **Generate** all 8 context file formats from a single scan
4. **Sync** automatically via GitHub Action — on every push, context files are regenerated and auto-committed

Zero friction. No PRs to review. No manual updates. Every AI tool always has fresh context.

### Dual-Purpose Dashboard: "See What Your AI Sees"

The 27 scanners produce rich structured data about every codebase. This data powers two outputs:

| Output | Audience | Purpose |
|--------|----------|---------|
| **Context files** (8 formats) | AI coding tools | Give AI assistants architectural understanding |
| **Codebase intelligence dashboard** | Human developers | Visualize components, complexity, dependencies, patterns |

The dashboard shows developers the SAME data that gets encoded into context files:
- Component inventory → becomes component list in AGENTS.md
- Complexity heatmap → becomes "avoid modifying complex areas" in rules
- Dependency graph → becomes import pattern guidance
- Route map → becomes API structure in context

**Why this matters**: If the scan misses something or gets it wrong, the developer can SEE it and add custom rules. This creates a feedback loop: scan → visualize → customize → better context files → better AI output.

**Pricing alignment**: The visualization layer is what justifies the Pro tier. The CLI generates files for free (commodity). The dashboard shows you what was found + keeps files auto-synced (insight + automation). The team tier adds shared rules and org-wide views.

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
| Repos using AGENTS.md | **60,000+** (20K+ in Aug 2025, 60K+ by Dec 2025) | [agents.md](https://agents.md/), [AlteredCraft analysis](https://alteredcraft.com/p/mapping-ai-agent-adoption-across) |
| GitHub stars (agentsmd/agents.md) | **16,000** (1,100 forks) | [GitHub](https://github.com/agentsmd/agents.md) |
| GitHub stars (openai/agents.md) | **8,800** (693 forks) | [GitHub](https://github.com/openai/agents.md) |
| Tools supporting AGENTS.md | **22+** | [agents.md](https://agents.md/) |
| Managed by | Linux Foundation (Agentic AI Foundation, formed Dec 9, 2025) | [LF Announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) |
| AAIF Platinum Members | AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft, OpenAI | [LF](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) |
| AAIF Founding contributions | Anthropic's MCP, Block's goose, OpenAI's AGENTS.md | [OpenAI](https://openai.com/index/agentic-ai-foundation/), [TechCrunch](https://techcrunch.com/2025/12/09/openai-anthropic-and-block-join-new-linux-foundation-effort-to-standardize-the-ai-agent-era/) |

**Tools supporting AGENTS.md (full list):** Codex (OpenAI), Cursor, GitHub Copilot, Gemini CLI, Jules (Google), VS Code, Devin (Cognition), Amp, Factory, Aider, goose, OpenCode, Zed, Warp, RooCode, Kilo Code, Phoenix, Semgrep, Windsurf, UiPath, Android Studio.

**Key gap**: Claude Code does NOT natively support AGENTS.md ([Issue #6235](https://github.com/anthropics/claude-code/issues/6235)). This is why CLAUDE.md remains a separate format — and why generating both is necessary. Even Anthropic is a Platinum AAIF member, yet their own tool doesn't support the standard they helped fund.

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

| Competitor | GitHub Stars | Pricing | What They Do | Hashmark Advantage |
|-----------|------------|---------|-------------|-------------------|
| **Repomix** | 20,600 | Free (MIT) | Packs entire repo into single XML/MD for LLM context | One-shot dump, no tool-specific formats, no sync |
| **Context7** (Upstash) | 44,200 | Free (500 req/mo) / $7/seat/mo | Library docs via MCP server | Library docs only, not your codebase |
| **SpecStory** | — | Free (VS Code ext) | Saves AI chat history, derives Cursor rules | Chat-derived (reactive), Cursor-only output |
| **cursorrules.org** | — | Free | Template-based .cursorrules generator | Template-based, not code-aware, single format |
| **Cursor Directory** | — | Free | Generates rules from package.json | Only reads package.json, Cursor-only |
| **CTX** | — | Free (MIT) | Collects codebase info into markdown for AI | Manual config, no tool-specific formats, no sync |
| **hashmark CLI** | — | Free (our CLI) | Generates AGENTS.md from 27 scanners | AGENTS.md only, manual, feeds Hashmark funnel |

#### Repomix (20.6K stars, 188K monthly npm downloads)
One-shot codebase dump tool by Kazuki Yamada ([@yamadashy](https://github.com/yamadashy)). Packs your entire repo into a single XML/Markdown file you paste into ChatGPT/Claude. Originally "Repopack" — renamed Dec 2024 due to legal considerations. Has MCP server. **Key difference**: Repomix creates a blob of raw code. Hashmark creates structured, tool-specific context files with architecture analysis, anti-patterns, and component inventories. Repomix is adjacent (context input), not directly competitive (context file generation/management).

#### Context7 (44.2K stars, by Upstash)
MCP server that injects *third-party library documentation* into your AI editor's context. When you type "use context7" in Cursor, it resolves the library and injects relevant docs from a vector database. **Pricing controversy**: On January 13, 2026, Context7 [quietly slashed its free tier by 92%](https://blog.devgenius.io/context7-quietly-slashed-its-free-tier-by-92-16fa05ddce03) — from ~6,000 req/month to 500 req/month — sparking significant backlash. **Key difference**: Context7 provides library docs; Hashmark provides your own codebase's architecture and patterns. Complementary, not competitive. The pricing controversy creates an opening — developers are wary of cloud pricing bait-and-switch.

#### SpecStory (Boston, 4-6 employees, backed by NP-Hard Ventures)
Captures every AI coding conversation from Cursor, Copilot, Claude Code, and Codex. Scans conversations for rule-like statements ("always use Riverpod", "never use Bloc") and derives rules automatically. Local-first (`.specstory/history/`), with cloud search. **Key difference**: SpecStory learns from what you *said* to AI; Hashmark learns from what your code *actually is*. SpecStory requires ongoing AI usage to build rules; Hashmark works from day one. Could be complementary (chat memory + codebase context).

#### Cursor v0.49 Built-in Rule Generation
Cursor itself now has `/Generate Cursor Rules` as a built-in command. Generates rules from active conversation context. **Key limitation**: Only works within Cursor. Only generates Cursor rules. Requires conversation context. Does not proactively scan your codebase. **Risk level**: Medium — could expand to be more codebase-aware in future versions.

### Adjacent Competitors

| Competitor | What They Do | Why Not Competitive |
|-----------|-------------|-------------------|
| **SonarSource** ($4.7B valuation, Enterprise pricing) | Code quality + security — SAST, code smells, tech debt. **New**: MCP Server (AI workflow integration), SonarSweep (improving LLM code). 35+ languages. | Post-generation validation, not pre-generation context. Enterprise pricing. Their new AI products show they see AI coding assistants eating their lunch — the exact space Hashmark is native to. |
| **Greptile** (YC W24, ~$180M valuation) | AI code review with full codebase context | Different workflow stage (PR review, not context files). $20/user/mo. |
| **Qodo** (formerly Codium, $40M Series A) | AI code review, test generation, PR automation | Different problem (testing, not context). $19-30/user/mo. |
| **Factory** ($50M raised) | Autonomous coding agents ("Droids") | Potential customer — their agents use AGENTS.md. Co-creator of AGENTS.md standard. |
| **Sourcegraph Cody** | Vector embeddings of entire codebase for AI context | Real-time indexing, not file generation. Different architecture. |
| **AST Visualizer** (ast-visualizer.com, vibe-coded) | AST tree visualization, complexity analysis, dependency graphs for Python | Python-only, single language, no AI context output, no auto-sync. Weekend project proving the space is attractive. |

### Reference Model: SonarSource

SonarSource ($4.7B valuation, est. 2008) is the closest business model reference — not as a competitor but as a blueprint:

**What we share:**
- Scanner engine that analyzes codebases (their 35+ languages, our 27 scanners)
- CLI → CI/CD pipeline (GitHub Action) → Dashboard funnel
- Freemium model (free CLI → paid cloud/server)
- Developer-first go-to-market
- The same scan data can power multiple outputs

**What we steal from them:**
- **Dashboard as "show your work"**: Display scan results (complexity, components, dependencies) as proof of intelligence before delivering context files. Users trust the output more when they can see the analysis.
- **CI/CD flywheel**: GitHub Action runs on every push, keeps files in sync. Already built.
- **Freemium funnel**: Free CLI (unlimited) → paid dashboard + GitHub Action + team features.

**What we don't do:**
- We don't compete on code quality (SonarSource's domain, 15+ year head start)
- We don't chase enterprise compliance (their bread and butter)
- We don't try to find bugs — we make AI assistants understand architecture

**Key insight**: SonarSource just launched an **MCP Server** and **SonarSweep** (improving LLM code) — they're pivoting toward the AI coding space where Hashmark is native. The incumbents are playing catch-up in our lane.

### Pricing Benchmarks (Developer Tools, 2026)

| Tool | Free | Individual | Team/Business |
|------|------|-----------|---------------|
| **GitHub Copilot** | Limited | $10/mo (Pro), $39/mo (Pro+) | $19/user/mo |
| **Cursor** | Limited | $20/mo | $40/user/mo |
| **Windsurf** | 25 credits/mo | $15/mo | $35/mo |
| **Claude Pro** | Limited | $20/mo | $30/seat/mo |
| **Greptile** | 14-day trial | $20/user/mo | Custom |
| **Context7** | 500 req/mo | $7/seat/mo | Custom |
| **SonarQube Cloud** | 50K LoC | EUR 30/mo | Custom |
| **Hashmark** | **1 repo** | **$19/mo** | **$29/seat/mo** |

Industry trends (2026): Individual tier sweet spot is $10-20/mo. Team tier sweet spot is $19-39/seat/mo. 78% of dev tools now use consumption-based pricing. Hashmark's $19/mo is right in the sweet spot.

**Sources**: [GitHub Copilot plans](https://github.com/features/copilot/plans), [Cursor pricing](https://cursor.com/pricing), [Claude pricing](https://claude.com/pricing), [Greptile](https://greptile.com/pricing), [Context7](https://context7.com/docs/plans-pricing), [SonarQube](https://sonarsource.com/plans-and-pricing/)

### Competitive Moat

**Hashmark's unique position**: All formats, auto-synced, zero friction.

No competitor does all three:
1. **All formats**: Repomix = raw dump. Context7 = library docs. SpecStory = Cursor only. cursorrules.org = template-based. Cursor v0.49 = Cursor only.
2. **Auto-synced**: Nobody auto-commits context files on every push via GitHub Action.
3. **Code-aware**: 27 scanners extract real architecture, not templates or chat history.
4. **Zero friction**: No PRs to review. No manual steps. Install once, forget forever.

### Threat Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cursor expands built-in rule generation to be codebase-aware | Medium | High | Hashmark covers 7 other tools Cursor can't reach |
| GitHub auto-generates copilot-instructions.md natively | Low | Very High | Would validate the space; likely acquires us first |
| SpecStory adds codebase scanning | Medium | Medium | Hashmark has 27 scanners, SpecStory would be starting from zero |
| Repomix adds format-specific output | Low | Medium | Different architecture (dump vs. structured analysis) |
| Context7 expands to codebase context | Low | Medium | Different core competency (library docs vs. codebase analysis) |

## How Auto-Sync Works

### GitHub Action Approach (No Server Needed)

```
User installs Hashmark GitHub Action (one-time setup)
    ↓
On every push to main branch:
    ↓
GitHub Action runs in the repo's CI environment
    ↓
Runs hashmark's 27 scanners on the codebase
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
| Windsurf Pro | $15/mo | Lower price, different feature set |
| Context7 Pro | $7/seat/mo | More features (27 scanners vs library docs), higher price justified |
| Greptile | $20/user/mo | Different stage (review vs context), same price range |
| SonarQube Cloud | EUR 30/mo | Different category (quality vs context), similar buyer |

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

1. **CLI → Cloud funnel**: hashmark CLI (652 downloads in 3 days) → Hashmark upsell in CLI output → free signup → Pro upgrade
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
- [ ] hashmark CLI shows Hashmark upsell

## Timeline: The Context File Explosion

| Date | Event | Source |
|------|-------|--------|
| April 2024 | `.cursorrules` introduced by Cursor | [Cursor docs](https://cursor.com/docs/context/rules) |
| September 2024 | `llms.txt` proposed by Jeremy Howard | [llmstxt.org](https://llmstxt.org/) |
| October 29, 2024 | `.github/copilot-instructions.md` announced at GitHub Universe '24 | [GitHub Changelog](https://github.blog/changelog/2024-10-29-multi-file-editing-code-review-custom-instructions-and-more-for-github-copilot-in-vs-code-october-release-v0-22/) |
| November 2024 | Windsurf Editor launched with `.windsurfrules` | [Windsurf blog](https://windsurf.com/blog/windsurf-launch) |
| February 2025 | Claude Code research preview with `CLAUDE.md` | [Anthropic](https://claude.com/blog/using-claude-md-files) |
| May 2025 | Claude Code GA with Claude 4 | [Anthropic](https://anthropic.com) |
| June 25, 2025 | Gemini CLI launched with `GEMINI.md` | [Gemini CLI docs](https://geminicli.com/docs/cli/gemini-md/) |
| August 2025 | **AGENTS.md released by OpenAI** — adopted by 20,000+ repos | [agents.md](https://agents.md/) |
| August 28, 2025 | GitHub Copilot adds AGENTS.md support | [GitHub Changelog](https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/) |
| October 2025 | Claude Code web launched | [Anthropic](https://anthropic.com) |
| December 9, 2025 | **Agentic AI Foundation formed** under Linux Foundation; AGENTS.md donated; 60,000+ repos | [LF Announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) |
| January 13, 2026 | Context7 slashes free tier by 92%, sparking backlash | [Dev Genius](https://blog.devgenius.io/context7-quietly-slashed-its-free-tier-by-92-16fa05ddce03) |
| February 2026 | Claude Code still does not natively support AGENTS.md | [Issue #6235](https://github.com/anthropics/claude-code/issues/6235) |
| February 2026 | **Hashmark** enters the market | — |
