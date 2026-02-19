# Hashmark — Business Model

## Company

- **Product**: Hashmark (hashmark.md)
- **Entity**: theft.studio
- **Founder**: Jason Poindexter (15 years at Google, Apple, Equinix — design + engineering)
- **Stage**: Pre-launch, building MVP
- **Model**: B2B SaaS (subscription)

## Traction So Far

The free CLI tool (hashmark) launched in February 2026:
- **652 downloads in 3 days** from a single blog post
- **47% conversion rate** from blog readers to CLI installs
- **8 versions published** (v1.0.0 → v1.1.5), rapid iteration
- **Zero paid marketing** — organic distribution only
- Published as `hashmark-cli` on npm

This is the most traction Jason has had in a year of shipping projects. The signal is clear: developers want this.

## Why Now

### The Context File Fragmentation Problem

Every AI coding tool introduced its own context file format between 2023-2026:

| Year | Format | Tool | What Happened |
|------|--------|------|---------------|
| 2023 | `.cursorrules` | Cursor | First mover, simple text file |
| 2024 | `CLAUDE.md` | Claude Code | Anthropic's hierarchical markdown format |
| 2024 | `.github/copilot-instructions.md` | GitHub Copilot | GitHub's instruction format |
| 2024 | `.windsurfrules` | Windsurf | Codeium's rules file |
| 2025 | `AGENTS.md` | Linux Foundation | Universal standard, 20K+ repos |
| 2025 | `.cursor/rules/*.mdc` | Cursor | New MDC format replacing .cursorrules |
| 2025 | `gemini.md` | Gemini CLI | Google's context format |
| 2025 | `.clinerules` | Cline | VS Code extension format |

**Result**: Developers who use multiple AI tools (most do) must maintain 5-7 files with overlapping content. Nobody does it well. Files go stale within days.

**Evidence**:
- Sentry opened a GitHub issue about migrating between formats
- Dev forums full of "how do I keep my .cursorrules and CLAUDE.md in sync?"
- The AGENTS.md standard was created specifically because of this fragmentation
- hashmark's 652 downloads in 3 days proves demand for automation

### AI Coding Tool Adoption Is Exploding

- GitHub Copilot: 15M+ developers (2025)
- Cursor: Fastest-growing IDE, millions of users
- Claude Code: Rapidly adopted since launch
- 76% of developers use or plan to use AI coding tools (Stack Overflow 2025)
- AI coding tool market projected $XX billion by 2028

### Developer Frustration with AI Code Quality

- DORA 2024: AI-assisted PRs have 9% more bugs, 91% more review time, 154% bigger
- CodeRabbit: AI PRs have 1.7x more issues
- Only 29% trust AI code accuracy (down from 40%)
- #1 frustration: "almost right but not quite" (45% of developers)

**The root cause**: AI doesn't understand the codebase well enough. Context files fix this, but only if they're accurate and up-to-date.

## Revenue Model

### Pricing

| Tier | Price | Target | Value Prop |
|------|-------|--------|------------|
| **Free** | $0 | Acquisition | Try it, see value, 1 repo |
| **Pro** | $19/mo | Solo devs | Unlimited repos, auto-sync, full dashboard |
| **Team** | $29/seat/mo | Engineering teams | Org rules, team dashboard, shared rules |

### Why $19/mo for Pro

- **Below GitHub Copilot** ($10-19/mo) — complementary tool, not a replacement
- **Below Cursor Pro** ($20/mo) — same buyer, additive value
- **Comparable to Context7** ($7/seat basic) — but more features
- **Well below SonarQube Cloud** ($14+/mo base) — different category but similar buyer

### Revenue Projections

| Month | Free Users | Pro Subs | Team Seats | MRR |
|-------|-----------|----------|------------|-----|
| 1 | 50 | 5 | 0 | $95 |
| 3 | 200 | 20 | 0 | $380 |
| 6 | 500 | 50 | 10 | $1,240 |
| 12 | 2,000 | 200 | 50 | $5,250 |
| 18 | 5,000 | 500 | 150 | $13,850 |
| 24 | 10,000 | 1,000 | 500 | $33,500 |

**Assumptions**:
- 10% free-to-Pro conversion (industry avg for dev tools: 2-5%, ours is higher because the free tier is intentionally limited)
- 5% of Pro users bring their team (Team tier)
- 3% monthly churn (low for dev tools with GitHub Action lock-in)
- Growth driven by blog posts, HN, CLI upsell, word of mouth

### Unit Economics

| Metric | Value |
|--------|-------|
| **CAC** (Free → Pro) | ~$0 (organic, CLI funnel) |
| **ARPU** | $19-29/mo |
| **LTV** (at 3% churn) | $633-967 |
| **Gross margin** | ~90% (Vercel hosting + Supabase DB only) |
| **Payback period** | Instant (no paid acquisition) |

### Infrastructure Costs

| Service | Cost | Notes |
|---------|------|-------|
| **Vercel** | $20/mo (Pro) | Hosting, edge functions, analytics |
| **Supabase** | $25/mo (Pro) | Postgres, auth backup, storage |
| **Domain** | ~$30/yr | hashmark.md |
| **Stripe** | 2.9% + $0.30/txn | Payment processing |
| **GitHub API** | Free | OAuth + repo access within rate limits |
| **Total fixed** | ~$50/mo | Profitable at 3 Pro subscribers |

Break-even at **3 Pro subscribers** ($57/mo revenue vs $50/mo costs).

## Competitive Moat

### Short-term (0-6 months)
- **Speed**: First to market with all-format auto-sync
- **CLI distribution**: 652+ installs feeding the funnel
- **Zero friction**: Auto-commit (competitors require PR review)

### Medium-term (6-18 months)
- **Data network effects**: More repos scanned = better pattern detection = better rules
- **Scan history**: Track how codebases evolve over time (competitors are point-in-time)
- **Custom rules marketplace**: Users share rules ("React best practices", "Tailwind conventions")
- **GitHub Action lock-in**: Once installed, switching cost is non-trivial

### Long-term (18+ months)
- **Industry standard**: If Hashmark becomes the default way to manage AI context files
- **Enterprise features**: SAML SSO, audit logs, compliance
- **API platform**: Other tools consume Hashmark scan data
- **Acquisition target**: GitHub, Anthropic, Cursor, Vercel would all benefit from owning this

### Codebase Intelligence Layer

The 27 scanners don't just generate context files — they produce a complete codebase intelligence picture (components, complexity, dependencies, patterns, routes, schemas). This creates a dual-purpose product:

1. **For AI tools**: Context files that make AI assistants understand your codebase
2. **For developers**: A visual dashboard showing what the AI sees ("See what your AI sees")

This dual output strengthens the business model:
- **Free tier**: CLI generates files (commodity, drives adoption)
- **Pro tier**: Dashboard visualizes scan results + auto-sync (insight + automation)
- **Team tier**: Shared intelligence across repos, org-wide rules

**Reference model**: SonarSource ($4.7B) built a business on scanning codebases and showing results in a dashboard. Hashmark does the same — but instead of showing bugs, we show what AI needs to know about your architecture. SonarSource is now rushing into the AI space (MCP Server, SonarSweep) which validates our positioning.

## Exit Scenarios

| Scenario | Timeline | Valuation | Acquirer |
|----------|----------|-----------|----------|
| **Acqui-hire** | 6-12 mo | $1-3M | Cursor, Anthropic, GitHub |
| **Product acquisition** | 12-24 mo | $5-15M | GitHub, Vercel |
| **Growth acquisition** | 24-36 mo | $20-50M | Larger dev tool company |
| **Independent** | Ongoing | $XXM ARR | Stay independent, bootstrap |

**Most likely path**: Build to $10K+ MRR, get noticed by GitHub/Cursor/Anthropic, acquisition offer in 12-24 months. The context file space is strategic for all major AI coding tool companies.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI tools consolidate on one format | Medium | High | Already generating all formats; pivot to the winner |
| AI tools auto-generate their own context | Low-Medium | High | Hashmark is tool-agnostic; covers all tools simultaneously |
| Repomix or Context7 add all-format support | Medium | Medium | Speed advantage; Hashmark has GitHub Action auto-sync |
| GitHub builds this natively into Copilot | Low | Very High | Would validate the space; likely acquires us first |
| Low conversion from free to paid | Medium | Medium | Adjust free tier limits; add more Pro-only features |
| Hashmark CLI gets cloned | High | Low | CLI is open source anyway; cloud product is the moat |
| Vibe-coded clones (AST Visualizer-style) | High | Low | Single-language, visualization-only — no multi-format output, no auto-sync, no dashboard. Easy to build a toy, hard to build the full platform. |

## Strategic Advantages

1. **Solo founder with AI**: One person with AI coding tools can build what previously required a team. Lower burn, faster iteration, higher margins.

2. **Proven distribution**: The blog post → CLI → cloud funnel is working. 47% conversion on first try.

3. **Standard alignment**: AGENTS.md is a Linux Foundation standard. We're building ON the standard, not competing with it.

4. **No server costs for scanning**: GitHub Actions run in the user's CI. We don't need to provision compute for scanning. Margins stay high.

5. **Network effects**: Every repo that uses Hashmark validates the product for other developers. Scan data improves pattern detection.
