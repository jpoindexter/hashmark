# Hashmark -- User Personas

Four personas with Jobs-to-be-Done for Hashmark (hashmark.md).

**Product**: Scans codebases with 27 scanners, generates AI context files for every coding tool (AGENTS.md, CLAUDE.md, .cursorrules, .cursor/rules/*.mdc, copilot-instructions.md, .windsurfrules, GEMINI.md, .clinerules).

**Tagline**: "One scan. Every format. Always in sync."

**Pricing**: Free (1 repo, manual scan) | Pro $19/mo (unlimited repos, auto-sync via GitHub Action) | Team $29/seat/mo (org-wide rules)

---

## P1: Solo Dev Sam

### Profile

| Attribute | Details |
|-----------|---------|
| **Role** | Full-stack indie hacker |
| **Company size** | Solo or 1-2 person side project |
| **Experience** | 4-8 years, ships 2-3 SaaS products per year |
| **Location** | Remote, US/EU timezone |
| **Annual income** | $80-150K (mix of freelance, product revenue, day job) |
| **Dev tool spend** | $60-100/mo (Cursor Pro $20, Claude Pro $20, Vercel $20, domain/hosting) |

### Tools

- **Primary AI**: Claude Code (terminal) + Cursor (IDE) -- switches between them constantly
- **Secondary AI**: GitHub Copilot (via VS Code), occasionally Gemini CLI for quick tasks
- **Stack**: Next.js, TypeScript, Tailwind, Prisma, Supabase or PlanetScale
- **Infra**: Vercel, GitHub, Stripe

### Day in the Life

- 6:30 AM: Opens Cursor, picks up where Claude Code left off last night. Realizes Cursor is suggesting raw Tailwind classes because `.cursorrules` doesn't mention the 40+ components added last month.
- 9:00 AM: Switches to Claude Code for a complex refactor. CLAUDE.md references an API route structure from 3 sprints ago. Spends 15 minutes re-explaining the current setup.
- 11:00 AM: Uses Copilot in VS Code to write tests. Copilot doesn't know the project uses Vitest (not Jest) because `copilot-instructions.md` doesn't exist.
- 2:00 PM: Considers updating context files. Opens `.cursorrules`, sees it's 847 lines of half-wrong information. Closes the file. Ships without updating.

### Job to be Done

> "When I switch between AI coding tools throughout my day, I want all of them to have the same accurate, up-to-date context about my codebase, so I stop wasting time re-explaining my project's components, patterns, and conventions to each tool."

### Pain Points

1. **File drift**: `.cursorrules` says the project uses Pages Router; it migrated to App Router 2 months ago. CLAUDE.md doesn't mention the new design system. `copilot-instructions.md` doesn't exist at all.
2. **Maintenance burden**: Knows context files make AI better, but maintaining 5-7 files across formats is a task that never makes the sprint. Always deprioritized in favor of shipping features.
3. **Tool-switching tax**: Each tool interprets the codebase differently without shared context. Claude Code generates one pattern, Cursor generates another. Sam spends 10-15 minutes per session correcting AI output.
4. **Stale component knowledge**: Added 30 components last month. None of the AI tools know they exist. AI keeps generating inline markup when reusable components are available.

### Goals

- Ship features faster by reducing time spent correcting AI output
- Use whichever AI tool is best for the task without context penalty
- Never manually write or update a context file again

### Discovery Channel

- Hacker News (reads daily), dev.to blog post, Twitter/X thread about context file fragmentation
- Or: runs `npx hashmark-cli` after seeing a blog post, sees the Hashmark upsell in CLI output

### Activation Trigger

Runs a free scan on their main project. Sees the scan output with 27 data points they never documented (components, hooks, API routes, anti-patterns). Downloads all 8 formats. Realizes these are better than what they manually wrote. Thinks: "If this stayed in sync automatically, I'd never touch these files again."

### Success Metric

- Context files auto-update on every push with zero effort
- AI tools across the board stop generating code that ignores existing components and patterns
- Saves 30+ minutes per week previously spent re-explaining codebase to AI tools or correcting AI suggestions

### Willingness to Pay

**$19/mo Pro** -- justified if it saves 30+ minutes per week. Already pays $20/mo for Cursor and $20/mo for Claude. Hashmark makes both of those investments work better. The auto-sync via GitHub Action is the upgrade trigger; manual scans on Free tier create enough friction to convert.

---

## P2: Tech Lead Taylor

### Profile

| Attribute | Details |
|-----------|---------|
| **Role** | Tech lead / engineering manager |
| **Company size** | 5-15 person startup, Series A or bootstrapped |
| **Experience** | 8-12 years, manages 3-8 engineers |
| **Location** | Remote-first startup, distributed team |
| **Team AI adoption** | Mandated or strongly encouraged; each dev chose their own tool |
| **Dev tool budget** | $200-500/mo for team tooling (GitHub org, CI, monitoring, AI seats) |

### Tools

- **Taylor's AI**: Claude Code + Cursor (power user)
- **Team AI mix**: 2 devs on Cursor, 1 on Copilot, 1 on Windsurf, 1 junior using Cline
- **Stack**: Next.js monorepo, TypeScript strict, Tailwind + custom design system, Prisma
- **Process**: GitHub PRs, CI/CD via GitHub Actions, linear for project management

### Day in the Life

- 9:00 AM: Reviews 4 PRs. Junior dev's PR has AI-generated code using `bg-blue-500` instead of `bg-primary` (design tokens). Another PR imports from `@/components/ui/button` instead of the barrel export `@/components/ui`. Third PR uses `useState` for server state instead of the team's TanStack Query pattern.
- 10:30 AM: Writes a Slack message explaining the design token system for the third time this month. Considers writing it down somewhere. Realizes they already did -- in CLAUDE.md. But not everyone uses Claude Code.
- 1:00 PM: New hire asks "where should I put my `.cursorrules`?" Taylor realizes there's no canonical version. Each dev has a different one, or none at all.
- 3:00 PM: Spends 45 minutes writing a team-wide `.cursorrules` file. Copies half of it from CLAUDE.md. Knows it will be outdated in 2 weeks.

### Job to be Done

> "When my team members use different AI coding tools, I want every tool to have the same accurate context about our architecture, conventions, and design system, so that AI-generated code is consistent across the team and I spend less time in PR review correcting preventable mistakes."

### Pain Points

1. **Inconsistent AI output across team**: Dev using Cursor gets different suggestions than dev using Copilot. Neither knows about the team's form validation pattern (react-hook-form + Zod). PRs reflect this chaos.
2. **Junior dev amplification problem**: Juniors rely heavily on AI. Without proper context, AI teaches them wrong patterns. Taylor reviews the same mistakes repeatedly -- wrong imports, hardcoded styles, missing error boundaries.
3. **No single source of truth**: Context files are per-developer, not per-repo. No way to enforce "this is how we build things here" across all AI tools simultaneously.
4. **Onboarding drag**: New hires take 2+ weeks to get AI tools producing code that matches team conventions. The ramp-up cost multiplies with every new hire.
5. **Org-wide rules needed**: Want to enforce rules like "always use design tokens" and "never use default exports" across all repos, not just one.

### Goals

- Reduce PR review time by catching convention violations before code is written (at the AI suggestion level)
- Standardize AI context across every developer and every tool on the team
- Set org-wide rules once, have them apply to all repos automatically
- Onboard new devs faster -- their AI tools know the codebase from day one

### Discovery Channel

- Engineering blog post about "standardizing AI tool usage across a team"
- Recommendation from another tech lead in a Slack community or Twitter thread
- Found via GitHub Action Marketplace while searching for CI/CD AI tooling

### Activation Trigger

Connects the team's main monorepo. Sees the scan output and realizes Hashmark documented things even Taylor didn't have written down (the full component inventory, all API routes with auth status, anti-patterns specific to their stack). Shares the scan results in Slack. Team reacts with "wait, we have 47 custom hooks?" Sets up org-wide rules. Adds the GitHub Action to CI.

### Success Metric

- PR review comments about AI-generated convention violations drop by 50%+
- All team members have consistent, auto-updated context regardless of which AI tool they use
- New hire onboarding: AI tools produce convention-compliant code from day one
- Taylor stops manually writing and distributing context files

### Willingness to Pay

**$29/seat/mo Team** -- for a 5-person team, that's $145/mo. Justified by: reduced PR review time (Taylor's time is expensive), fewer convention violations reaching production, faster onboarding. The org-wide rules feature is the differentiator vs. Pro. Already paying $19-40/seat for AI tools themselves; Hashmark makes all those seats more effective.

---

## P3: OSS Maintainer Morgan

### Profile

| Attribute | Details |
|-----------|---------|
| **Role** | Lead maintainer of a popular open source project |
| **Project** | UI component library or developer framework, 5K-50K GitHub stars |
| **Contributors** | 50+ total, 5-10 active, mostly drive-by PRs from the community |
| **Experience** | 10+ years, mass OSS contributor, employed at a tech company (maintains OSS on the side or as part of job) |
| **AI tool usage** | Personal: Claude Code. Contributors: everything imaginable |

### Tools

- **Personal**: Claude Code, occasionally Cursor
- **Contributors use**: Cursor, Copilot, Claude Code, Windsurf, Cline, Gemini CLI -- Morgan has no control over this
- **Project infra**: GitHub (issues, PRs, Actions), npm, semantic-release, Vitest/Playwright

### Day in the Life

- 7:00 AM: Opens GitHub notifications. 6 new PRs overnight. 4 are from contributors who clearly used AI to generate the code.
- 7:15 AM: PR #1 adds a new component but ignores the project's slot-based composition pattern. Uses `children` prop instead of named slots. AI didn't know the convention.
- 7:30 AM: PR #2 adds a feature but writes tests with Jest. The project uses Vitest. The CONTRIBUTING.md says this. The AI didn't read it.
- 8:00 AM: PR #3 is actually good -- the contributor manually added the project's CLAUDE.md context before coding. Morgan wishes every contributor did this.
- 8:30 AM: Writes a comment on PR #1 and #2 explaining the patterns. Copies the same explanations from last week's PR reviews. Considers adding context files to the repo but doesn't know which formats to support or how to keep them current.

### Job to be Done

> "When external contributors use AI tools to generate PRs for my project, I want those AI tools to already understand our architecture, conventions, and patterns, so I spend less time reviewing and rejecting AI-generated code that ignores our CONTRIBUTING.md."

### Pain Points

1. **AI-generated PRs ignore project conventions**: Contributors' AI tools don't read CONTRIBUTING.md or understand the project's patterns. PRs require extensive review comments that repeat the same corrections.
2. **Format coverage problem**: If Morgan adds a CLAUDE.md, it helps Claude Code users but not the Cursor or Copilot users. Adding all formats manually is unrealistic for an OSS maintainer's time budget.
3. **Contributor friction**: Asking contributors to "read the docs" doesn't work. But if the AI tools themselves had the right context, the code would be right from the start.
4. **Maintenance overhead**: Morgan already maintains README, CONTRIBUTING.md, docs site, changelog. Adding 5-7 AI context files is not going to happen manually.
5. **Stale docs**: The project ships monthly. Documentation (including any context files) is outdated within a release cycle.

### Goals

- Reduce time spent on PR review for AI-generated contributions
- Have all AI tools understand project conventions without contributor effort
- Keep context files in sync with the codebase automatically (zero maintainer effort)
- Improve contributor experience -- their AI tools work better with the project

### Discovery Channel

- Hacker News or Twitter thread about AI context files for open source
- Another OSS maintainer mentions Hashmark in a conference talk or blog post
- Sees a README badge on another project ("AI Context: Synced by Hashmark")
- Searches GitHub for "AGENTS.md generator" or "AI context file automation"

### Activation Trigger

Connects the project repo on the free tier. Scans it. Sees that the generated AGENTS.md and CLAUDE.md accurately describe the component API, testing patterns, and contribution conventions. Commits all 8 formats to the repo. Within a week, notices that 2 PRs from AI-assisted contributors actually follow the project's slot pattern correctly -- because the contributor's AI tool read the context files.

### Success Metric

- Percentage of AI-generated PRs that follow project conventions increases measurably
- PR review time for AI-assisted contributions drops
- Zero manual effort maintaining context files (auto-sync handles it)
- Contributors mention that their AI tool "just knew" the project's patterns

### Willingness to Pay

**Free tier** -- 1 repo is enough for the main project. OSS maintainers are cost-sensitive and time-rich in tooling evaluation but budget-poor. However, Morgan drives outsized value:
- The project's 5K-50K stars mean thousands of contributors see the context files
- Contributors discover Hashmark through the files and adopt it for their own projects
- Morgan may blog or tweet about the experience, reaching thousands of developers
- If the project is a monorepo or has multiple repos, Morgan may upgrade to Pro ($19/mo) for auto-sync

**Strategic value**: 1 OSS maintainer on Free tier can drive 50-100 Pro signups through visibility alone.

---

## P4: DevRel Dev Dana

### Profile

| Attribute | Details |
|-----------|---------|
| **Role** | Developer advocate / DevRel engineer / tech content creator |
| **Company size** | Works at a mid-size dev tool company (50-500 employees) or is an independent content creator |
| **Experience** | 6-10 years as a developer, 2-4 years in DevRel |
| **Audience** | 5K-50K followers on Twitter/X, writes for company blog or personal blog, speaks at 3-5 conferences/year |
| **Content output** | 2-4 blog posts/month, weekly tweets/threads, monthly conference talk or livestream |

### Tools

- **Evaluates everything**: Tries every new dev tool within 48 hours of launch
- **Primary AI**: Cursor + Claude Code (for demos and content)
- **Content tools**: VS Code (screen recordings), OBS, Notion, Figma
- **Publishing**: dev.to, company blog, Twitter/X, YouTube, newsletter

### Day in the Life

- 8:00 AM: Scrolls Twitter/X and Hacker News for new dev tools to evaluate. Sees a thread about AI context file fragmentation. Bookmarks it.
- 9:00 AM: Writing a blog post comparing AI coding tools. Realizes the comparison would be more compelling if each tool had proper context files -- but creating them for the demo repo is tedious.
- 11:00 AM: Colleague shares Hashmark. Dana runs a scan on a demo project. The output is visually impressive -- 27 scanners, 8 formats, component inventory, anti-pattern detection. Immediately sees this as content.
- 1:00 PM: Writes a Twitter thread: "I just scanned my codebase with @hashmark and it found 23 anti-patterns my AI tools have been ignoring. Here's what happened when I added the generated context files..." Thread gets 200+ likes.
- 3:00 PM: Drafts a blog post: "I Tested 8 AI Context File Formats. Here's Which Tools Actually Read Them."

### Job to be Done

> "When I evaluate and write about developer tools, I want something technically impressive that produces shareable, visual results, so I can create compelling content that my audience engages with and my reputation grows."

### Pain Points

1. **Content pipeline pressure**: Needs 2-4 fresh, engaging posts per month. Tools that produce visual, data-rich output are gold for content creation.
2. **Demo credibility**: Comparing AI tools without proper context files means unfair comparisons. But setting up context for each tool across a demo repo takes hours.
3. **Audience relevance**: Followers constantly ask "which AI tool should I use?" and "how do I get better AI code suggestions?" Dana needs tools that answer these questions practically.
4. **Differentiation**: Every DevRel person covers the same tools. Finding a novel angle (like AI context file automation) sets Dana apart.

### Goals

- Find tools that generate compelling content with minimal setup
- Build reputation as the person who explains the AI coding tool ecosystem
- Produce shareable artifacts (scan results, before/after comparisons, data insights)
- Stay ahead of the curve on dev tooling trends

### Discovery Channel

- Twitter/X (follows dev tool founders, sees Hashmark launch thread)
- Hacker News Show HN post
- Another DevRel person mentions it in a Slack community
- Product Hunt launch
- Direct outreach from Hashmark founder (DevRel folks are receptive to "try this and tell me what you think")

### Activation Trigger

Runs a scan on a well-known open source project or their company's demo repo. Sees the rich output: 279 components found, 46 API routes mapped, 23 anti-patterns detected, 87 env vars documented. The data is inherently shareable. Immediately screenshots the scan results for a Twitter thread. Writes a blog post within 48 hours.

### Success Metric

- Produces 1-2 pieces of content about Hashmark (blog post, Twitter thread, YouTube video, conference mention)
- Content reaches 5K-50K developers (Dana's audience)
- Generates 50-200 signups from a single piece of content
- Establishes ongoing relationship -- Dana covers Hashmark updates, new scanner announcements, data reports

### Willingness to Pay

**Free tier** -- Dana evaluates tools, doesn't need unlimited repos or auto-sync for content creation. One scan on one repo produces enough material for multiple pieces of content. However, Dana's value is amplification, not revenue:
- A single blog post from Dana can drive more signups than months of paid marketing
- A conference talk mentioning Hashmark reaches hundreds of developers in person
- A Twitter thread with scan results acts as social proof for thousands

**Strategic value**: 10x-100x amplification. One DevRel advocate on Free tier can generate the equivalent of $5K-50K in paid acquisition value through organic content and word-of-mouth.

---

## Persona Priority Matrix

| Persona | Tier | Revenue | Acquisition Cost | Strategic Value | Priority |
|---------|------|---------|-----------------|-----------------|----------|
| **P1: Solo Dev Sam** | Pro $19/mo | Direct | Low (blog, CLI funnel) | Core revenue driver | **Highest** |
| **P2: Tech Lead Taylor** | Team $29/seat | Highest per account | Medium (trust-building, demos) | Revenue + expansion | **High** |
| **P3: OSS Maintainer Morgan** | Free | $0 direct | Very low (organic) | Awareness + contributor funnel | **Medium** |
| **P4: DevRel Dev Dana** | Free | $0 direct | Very low (outreach) | Amplification + social proof | **Medium** |

### Build For, Market To

- **Build for** P1 and P2 -- they pay, and their needs drive product decisions (auto-sync, org rules, dashboard)
- **Market to** P3 and P4 -- they amplify, and their adoption creates visibility that drives P1 and P2 signups
- **Free tier exists for** P3 and P4 -- generous enough for their use case, visible enough to drive organic growth
