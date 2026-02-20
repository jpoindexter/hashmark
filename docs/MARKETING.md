# Hashmark — Marketing & Go-to-Market

## Brand

- **Name**: Hashmark
- **Symbol**: `#` (the markdown heading character)
- **Domain**: hashmark.md
- **Tagline**: "One scan. Every format. Always in sync."
- **Voice**: Technical, concise, terminal aesthetic. No fluff, no buzzwords.
- **Colors**: Dark background (zinc-950), emerald accent (#10b981), monospace everything

## Target Audience

### Primary: Solo Developers / Indie Hackers
- **Who**: Developers shipping SaaS products with AI coding tools
- **Where**: dev.to, Hacker News, Twitter/X, Reddit r/programming, r/webdev, Indie Hackers
- **Pain**: "I wrote a .cursorrules file 3 months ago. It's completely wrong now."
- **Trigger**: They just added a component library and their AI keeps generating raw divs instead of using existing components
- **Budget**: $10-30/mo for dev tools (already paying for Cursor, hosting, domains)

### Secondary: Engineering Teams (5-20 devs)
- **Who**: Teams adopting AI coding tools company-wide
- **Where**: Engineering blogs, conference talks, Slack communities
- **Pain**: "Every developer on my team has different .cursorrules. Half of them are empty."
- **Trigger**: A PR review where AI-generated code ignores team conventions
- **Budget**: $20-50/seat/mo (already paying for GitHub Enterprise, CI, etc.)

### Tertiary: Open Source Library Authors
- **Who**: Authors of popular npm/pip/gem packages
- **Where**: GitHub, npm, package manager communities
- **Pain**: "AI tools keep using my library wrong because they don't understand the API"
- **Trigger**: GitHub issues saying "AI told me to do X but it doesn't work"
- **Budget**: $19/mo (Pro) or free tier for open source

## Distribution Channels

### 1. CLI → Cloud Funnel (Primary)

**The proven channel.** hashmark CLI got 652 downloads in 3 days from one blog post.

```
Blog post / HN / Twitter
    ↓ (47% conversion)
CLI install: npx hashmark-cli
    ↓ (generates AGENTS.md, shows value)
CLI output: "Want all 7 formats + auto-sync? → hashmark.md"
    ↓ (X% conversion)
Free signup → connect repo → scan
    ↓ (10% conversion)
Pro upgrade ($19/mo)
```

**Action items:**
- [ ] Add Hashmark upsell to hashmark CLI output
- [ ] Add "Powered by Hashmark" footer to generated AGENTS.md files
- [ ] Track CLI → signup conversion with UTM params

### 2. Blog Posts (High ROI)

The first blog post converted 47% of readers to CLI downloads. Blog is the highest-ROI channel.

**Planned posts:**

| Title | Platform | Target | Expected |
|-------|----------|--------|----------|
| "Stop Maintaining 7 AI Context Files" | dev.to, Hashnode | Solo devs | 1000 views, 200 downloads |
| "How We Scanned 1000 Repos" (data post) | Hacker News | Broad dev | 5000 views, 500 signups |
| "Your .cursorrules Is Wrong (And How to Fix It)" | dev.to | Cursor users | 2000 views, 300 signups |
| "AGENTS.md vs CLAUDE.md vs .cursorrules" | dev.to | All AI tool users | 3000 views, 400 signups |
| "Every AI Coding Tool's Context Format, Compared" | Medium, HN | Broad | 5000 views, 600 signups |
| "I Scanned My Codebase and Found 47 Anti-Patterns" | Reddit, HN | Curious devs | 3000 views, 400 signups |

**Content strategy**: Every post should be useful standalone (not just marketing). Show actual scan output. Include data.

### 3. Hacker News

**Launch post**: "Show HN: Hashmark — One scan generates AI context files for every coding tool"

**Timing**: Tuesday or Wednesday, 9am ET (peak HN traffic)

**HN formula that works**:
- Technical deep-dive, not marketing speak
- Show the problem with specific examples
- Link to live demo or CLI
- Be active in comments (founder advantage)

### 4. Twitter/X

**Thread ideas**:
- "I maintain 7 different AI context files for my codebase. Here's what each one does and why they all say different things." (thread with screenshots)
- "I scanned 100 open source repos. Only 3% had up-to-date AI context files." (data thread)
- "Your .cursorrules file is probably lying to your AI." (provocative, educational)

### 5. GitHub README Badge

For Pro users, offer an "AI Context Status" badge for their README:

```markdown
[![Hashmark](https://hashmark.md/badge/jpoindexter/myrepo)](https://hashmark.md)
```

Shows: "AI Context: Synced" or "AI Context: 7 formats, updated 2h ago"

Free viral distribution — every repo with a badge advertises Hashmark.

### 6. GitHub Action Marketplace

Publishing the Hashmark GitHub Action to the marketplace gives us:
- Discoverability (developers search for "AI context" actions)
- Trust signal (GitHub-verified)
- Installation numbers as social proof

### 7. CLI Upsell Moments

Hashmark CLI should show Hashmark at these moments:

```
After scan completes:
  ✓ Generated AGENTS.md (~11K tokens)

  💡 Want CLAUDE.md, .cursorrules, and 5 more formats?
     → hashmark.md (free to start)

When user tries --claude or --cursor flags:
  These formats require Hashmark Cloud.
  → Sign up free at hashmark.md

When scanning a large monorepo:
  Your monorepo has 12 packages. Hashmark Cloud can
  auto-sync context files for each one.
  → hashmark.md
```

## Launch Plan

### Pre-Launch (1 week before)
- [ ] Landing page live at hashmark.md
- [ ] CLI upsell added to hashmark
- [ ] 3 teaser tweets about the fragmentation problem
- [ ] Email list signup on landing page (for "early access")
- [ ] Scan 10 popular open source repos, screenshot results for blog

### Launch Day
- [ ] Blog post: "Stop Maintaining 7 AI Context Files — Meet Hashmark"
- [ ] Hacker News: Show HN post
- [ ] Twitter: Launch thread
- [ ] Reddit: r/programming, r/webdev posts
- [ ] Product Hunt: Submit listing
- [ ] Update hashmark CLI with Hashmark link

### Post-Launch (Week 1)
- [ ] Respond to every HN comment
- [ ] DM developers who share the post
- [ ] Follow up with anyone who signs up but doesn't connect a repo
- [ ] Blog post #2 based on launch data ("We Scanned 100 Repos in 24 Hours")

### Ongoing
- [ ] Weekly blog post or data insight
- [ ] Monthly "State of AI Context Files" report
- [ ] Feature releases announced on Twitter + changelog

## Messaging Framework

### Elevator Pitch (10 seconds)
"Hashmark scans your codebase and generates AI context files for every coding tool — Cursor, Claude Code, Copilot, all of them — and keeps them in sync automatically."

### Value Proposition (30 seconds)
"Every AI coding tool has its own context file — .cursorrules, CLAUDE.md, AGENTS.md, copilot-instructions. Developers maintain 5-7 files with the same content, and they all go stale. Hashmark runs 27 scanners on your codebase, generates all formats from a single scan, and auto-syncs them on every push via GitHub Action. Connect once, never think about it again."

### Pain Point Hooks (for headlines/tweets)
- "Your .cursorrules file is 3 months old. Your AI doesn't know about half your components."
- "You have 279 components but your AI keeps writing raw HTML. Sound familiar?"
- "7 different files, 7 different formats, all saying different things about your codebase."
- "Stop teaching AI about your codebase. Let Hashmark do it."
- "One scan. Every format. Always in sync."

### Objection Handling

| Objection | Response |
|-----------|----------|
| "I already have .cursorrules" | You have ONE format. What about Claude Code, Copilot, Gemini? And is it up to date? |
| "I can write these files manually" | You can. But you won't keep 7 files in sync across every push. Nobody does. |
| "AI tools will figure out my codebase on their own" | They read these files for a reason — context makes them dramatically better. The tools themselves recommend it. |
| "Repomix does this" | Repomix packs files into one blob. Hashmark generates structured context for each tool in its native format. |
| "$19/mo is too much" | It's less than a GitHub Copilot seat, and it makes all your AI tools work better. |
| "What if formats consolidate?" | Then we generate one file instead of seven. The scanning and auto-sync value remains the same. |

## Metrics to Track

| Metric | Tool | Goal |
|--------|------|------|
| Blog post views | dev.to analytics, GA | 1000+ per post |
| CLI downloads | npm stats | 200+/week |
| CLI → signup conversion | UTM tracking | 5-10% |
| Free signups | Postgres / PostHog | 50 in month 1 |
| Activation (connected repo + scan) | PostHog | 50% of signups |
| Free → Pro conversion | Stripe | 10% in first month |
| MRR | Stripe | $95+ in month 1 |
| Churn | Stripe | <5% monthly |
| NPS | In-app survey | 40+ |

## Social Proof Strategy

### Phase 1: Numbers
- "652 downloads in 3 days"
- "27 scanners"
- "7 output formats"
- "Zero config"

### Phase 2: Usage
- "500+ repos scanned"
- "Used by developers at [company logos]"
- GitHub Action marketplace install count

### Phase 3: Testimonials
- Developer quotes from Twitter/GitHub
- Case studies: "How [company] standardized AI context across 15 repos"
- Open source project endorsements
