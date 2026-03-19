# hashmark agents — Spec

Generate a full `.claude/agents/` company from a single codebase scan.

---

## The Problem

AI coding tools give you one agent. Real software companies have 50+ roles. hashmark scans your codebase and already knows everything needed to generate a full agent company — the stack, components, API routes, DB schema, complexity hotspots. We just haven't used that data to build the agents directory yet.

## The Output

Running `hashmark agents` generates:

```
.claude/agents/
├── engineering/
│   ├── frontend-developer.md
│   ├── backend-architect.md
│   ├── database-architect.md
│   ├── devops-automator.md
│   ├── security-engineer.md
│   ├── ml-engineer.md
│   ├── sre.md
│   ├── test-results-analyzer.md
│   ├── performance-benchmarker.md
│   └── rapid-prototyper.md
├── product/
│   ├── product-manager.md
│   ├── sprint-prioritizer.md
│   ├── ux-designer.md
│   ├── ux-researcher.md
│   └── feedback-synthesizer.md
├── design/
│   ├── ui-designer.md
│   ├── brand-guardian.md
│   ├── visual-storyteller.md
│   └── asset-exporter.md
├── marketing/
│   ├── growth-hacker.md
│   ├── content-creator.md
│   ├── social-media-manager.md
│   ├── seo-optimizer.md
│   ├── copywriter.md
│   └── ad-creative-designer.md
├── sales/
│   ├── lead-qualifier.md
│   ├── proposal-writer.md
│   ├── pitch-deck-builder.md
│   ├── follow-up-agent.md
│   └── pipeline-tracker.md
├── operations/
│   ├── finance-tracker.md
│   ├── analytics-reporter.md
│   ├── project-tracker.md
│   ├── legal-compliance-checker.md
│   ├── infrastructure-maintainer.md
│   └── support-responder.md
├── pr/
│   ├── press-release-writer.md
│   ├── crisis-responder.md
│   ├── journalist-outreach.md
│   └── media-monitor.md
└── INDEX.md
```

Each `.md` file is a Claude Code subagent. Claude Code can spin these up via the Agent tool when the right task arises.

---

## Claude Code Subagent Format

Each file needs:

```markdown
---
name: Frontend Developer
description: Use for React/Next.js component work, UI implementation, styling, and client-side features. Knows the full component library and design system.
---

You are the Frontend Developer at [Project Name].

## Your Stack
[filled from scan: framework, version, styling, shadcn, etc.]

## Your Domain
- src/components/** (46 components — check before creating new ones)
- src/app/(marketing)/**
- src/app/(dashboard)/**

## Standards
- Never use `any`
- Prefer Server Components — only `use client` when needed
- Always use next/image and next/link
- Never hardcode colors — use semantic tokens

## Key Files
[filled from scan: high-impact files relevant to this role]
```

The `description` field is what Claude Code uses to decide which agent to spin up. It needs to be specific and action-oriented.

---

## Role Taxonomy (Google/Alphabet Model)

Based on real company org structures. Every role maps to one `.md` file.

### Engineering & Technology
| Role | Agent File | Triggered By Scan When... |
|------|-----------|--------------------------|
| Software Engineer (Frontend) | `frontend-developer.md` | React/Next.js components found |
| Software Engineer (Backend) | `backend-architect.md` | API routes found |
| Database Architect | `database-architect.md` | Prisma/SQL schema found |
| Site Reliability Engineer | `sre.md` | Always (infra awareness) |
| Security Engineer | `security-engineer.md` | Auth, billing, API keys found |
| ML / AI Engineer | `ml-engineer.md` | AI SDK / LLM calls found |
| Test Engineer | `test-results-analyzer.md` | Test files found |
| DevOps / Automation | `devops-automator.md` | GitHub Actions / CI found |
| Performance Engineer | `performance-benchmarker.md` | Next.js app |
| Rapid Prototyper | `rapid-prototyper.md` | Always |

### Product & Design
| Role | Agent File | Triggered By Scan When... |
|------|-----------|--------------------------|
| Product Manager | `product-manager.md` | Always |
| Sprint Prioritizer | `sprint-prioritizer.md` | Always |
| UX Designer | `ux-designer.md` | Components + styling found |
| UX Researcher | `ux-researcher.md` | Always |
| Feedback Synthesizer | `feedback-synthesizer.md` | Always |
| UI Designer | `ui-designer.md` | shadcn/Tailwind found |
| Brand Guardian | `brand-guardian.md` | Design tokens found |

### Marketing & Growth
| Role | Agent File | Triggered By Scan When... |
|------|-----------|--------------------------|
| Growth Hacker | `growth-hacker.md` | Always |
| Content Creator | `content-creator.md` | Always |
| SEO Optimizer | `seo-optimizer.md` | Next.js/marketing pages found |
| Social Media Manager | `social-media-manager.md` | Always |
| Copywriter | `copywriter.md` | Always |
| Ad Creative Designer | `ad-creative-designer.md` | Always |

### Sales & Revenue
| Role | Agent File | Triggered By Scan When... |
|------|-----------|--------------------------|
| Lead Qualifier | `lead-qualifier.md` | Always |
| Proposal Writer | `proposal-writer.md` | Always |
| Pitch Deck Builder | `pitch-deck-builder.md` | Always |
| Follow-Up Agent | `follow-up-agent.md` | Always |
| Pipeline Tracker | `pipeline-tracker.md` | Always |

### Operations & G&A
| Role | Agent File | Triggered By Scan When... |
|------|-----------|--------------------------|
| Finance Tracker | `finance-tracker.md` | Stripe integration found |
| Analytics Reporter | `analytics-reporter.md` | Analytics/events found |
| Project Tracker | `project-tracker.md` | Always |
| Legal Compliance | `legal-compliance-checker.md` | Always |
| Infrastructure Maintainer | `infrastructure-maintainer.md` | Vercel/cloud config found |
| Support Responder | `support-responder.md` | Always |

### PR & Communications
| Role | Agent File | Triggered By Scan When... |
|------|-----------|--------------------------|
| Press Release Writer | `press-release-writer.md` | Always |
| Crisis Responder | `crisis-responder.md` | Always |
| Journalist Outreach | `journalist-outreach.md` | Always |
| Media Monitor | `media-monitor.md` | Always |

---

## Architecture

### New CLI Command
```bash
hashmark agents [dir]         # generate .claude/agents/ from scan
hashmark agents --dry-run     # preview without writing
hashmark agents --dept eng    # only engineering agents
```

### Source Structure
```
packages/cli/src/
├── agents/                   # role template library (static)
│   ├── engineering/
│   │   ├── frontend-developer.md
│   │   └── ...
│   ├── product/
│   ├── marketing/
│   └── ...
├── formats/
│   └── agents-company.ts     # generator: merges templates + scan data
└── cli.ts                    # new `agents` command registered here
```

### Generator Logic (`agents-company.ts`)
1. Take `ScanResult` from engine
2. For each role template, determine if it's relevant to this codebase
3. Fill in codebase-specific context (stack, components, routes, DB, key files)
4. Write to `.claude/agents/{dept}/{role}.md`
5. Generate `INDEX.md` with the company org chart

### Template Interpolation
Templates have placeholders that get filled from scan data:

```
{{project_name}}        → from package.json name
{{framework}}           → Next.js 16.1.6, App Router
{{components_count}}    → 46
{{components_list}}     → grouped by directory
{{api_routes}}          → POST /api/scan/:repoId (auth), etc.
{{db_models}}           → User, Repository, Scan, etc.
{{high_impact_files}}   → src/lib/auth.ts (25 dependents), etc.
{{critical_rules}}      → NEVER use any, ALWAYS use next/image, etc.
{{has_stripe}}          → true/false → include billing context
{{has_auth}}            → true/false → include auth context
```

---

## INDEX.md (Company Overview)

Generated at `.claude/agents/INDEX.md`:

```markdown
# [Project Name] — Agent Company

Scan: 319 files · 40,163 lines · Next.js 16 · TypeScript · Prisma

## Engineering
- **frontend-developer** — React/Next.js components, UI, styling
- **backend-architect** — API routes, server actions, auth
- **database-architect** — Prisma schema, migrations, queries
- **devops-automator** — GitHub Actions, releases, deployment
- **security-engineer** — Auth flows, billing, API security

## Product
- **product-manager** — Roadmap, priorities, requirements
- **sprint-prioritizer** — Sprint planning, task breakdown

## Operations
- **finance-tracker** — Stripe billing, revenue tracking
- **analytics-reporter** — Usage metrics, KPIs
...

## How to Use
Claude Code picks the right agent automatically based on your request.
To invoke manually: "use the database-architect agent to..."
```

---

## What's Different from Existing Formats

| Current hashmark output | `hashmark agents` output |
|------------------------|--------------------------|
| CLAUDE.md — one file, all context | 30-40 files, each agent gets only their domain |
| Generic rules for all AI tools | Role-specific persona + responsibility |
| Static configuration | Active agents Claude can spin up |
| Describes the codebase | Defines who does what in the company |

---

## Build Order

1. Write role templates for engineering dept (most codebase-dependent)
2. Write role templates for product/design
3. Write role templates for marketing/sales/ops (mostly static, less codebase context)
4. Build `agents-company.ts` generator with template interpolation
5. Register `hashmark agents` command in `cli.ts`
6. Generate `INDEX.md`
7. Test against hashmark's own codebase

---

## Open Questions

- **Seniority levels**: Do we generate `L3-frontend-developer.md` vs `L7-staff-engineer.md`? Probably not for v1 — one file per role.
- **Custom roles**: Should setup wizard ask "which departments does your company have?" to filter which agents get generated?
- **Paperclip integration**: Could `hashmark agents --paperclip` also push these as agents to a running Paperclip instance via its REST API?
- **Update cadence**: When the codebase changes, do the agent files stay stale? Could add `hashmark agents --sync` to refresh context.
