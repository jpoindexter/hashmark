# Hashmark Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                    hashmark.md                       │
│                  (Next.js on Vercel)                 │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Landing  │  │  Auth    │  │    Dashboard     │  │
│  │  Page    │  │ (GitHub  │  │  (Repos, Scans,  │  │
│  │          │  │  OAuth)  │  │   Intelligence)  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Stripe   │  │ GitHub   │  │    Scanner       │  │
│  │ Payments │  │   API    │  │   (hashmark   │  │
│  │          │  │ (Octokit)│  │    subprocess)   │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │           Prisma + Postgres                 │    │
│  │    (Users, Repos, Scans, Files, Rules)      │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

                        │
                        │ Creates workflow file
                        ▼

┌─────────────────────────────────────────────────────┐
│              User's GitHub Repository               │
│                                                     │
│  .github/workflows/hashmark.yml                     │
│       │                                             │
│       │ On push to main:                            │
│       ▼                                             │
│  ┌──────────────────────────────────┐               │
│  │     Hashmark GitHub Action      │               │
│  │                                  │               │
│  │  1. npx hashmark-cli │               │
│  │  2. Generate all 7 formats       │               │
│  │  3. Auto-commit if changed       │               │
│  └──────────────────────────────────┘               │
│                                                     │
│  Output files:                                      │
│  ├── AGENTS.md                                      │
│  ├── CLAUDE.md                                      │
│  ├── .cursorrules                                   │
│  ├── .cursor/rules/project.mdc                      │
│  ├── .github/copilot-instructions.md                │
│  ├── .windsurfrules                                 │
│  └── gemini.md                                      │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

```
hashmark/
├── docs/                      # Product documentation
│   ├── ARCHITECTURE.md        # This file
│   ├── PRODUCT.md             # Product spec
│   └── ROADMAP.md             # Build roadmap
├── prisma/
│   └── schema.prisma          # Database schema
├── public/                    # Static assets
├── src/
│   ├── app/
│   │   ├── (marketing)/       # Public pages (landing, pricing)
│   │   │   ├── layout.tsx
│   │   │   └── pricing/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/       # Auth-required pages
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx           # Repo overview
│   │   │   │   └── [repoId]/
│   │   │   │       ├── page.tsx       # Repo intelligence
│   │   │   │       └── files/
│   │   │   │           └── page.tsx   # Generated files
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/    # NextAuth handler
│   │   │   │   └── route.ts
│   │   │   ├── scan/
│   │   │   │   └── route.ts           # Trigger scan
│   │   │   └── webhooks/
│   │   │       ├── stripe/
│   │   │       │   └── route.ts       # Stripe webhooks
│   │   │       └── github/
│   │   │           └── route.ts       # GitHub webhooks
│   │   ├── layout.tsx                 # Root layout
│   │   ├── page.tsx                   # Landing page
│   │   └── globals.css
│   ├── components/
│   │   ├── landing/                   # Landing page components
│   │   │   ├── hero.tsx
│   │   │   ├── how-it-works.tsx
│   │   │   ├── pricing-table.tsx
│   │   │   └── footer.tsx
│   │   ├── dashboard/                 # Dashboard components
│   │   │   ├── repo-card.tsx
│   │   │   ├── scan-results.tsx
│   │   │   ├── kpi-card.tsx
│   │   │   └── file-preview.tsx
│   │   └── shared/                    # Shared UI
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── nav.tsx
│   │       └── badge.tsx
│   └── lib/
│       ├── auth.ts                    # NextAuth config
│       ├── db.ts                      # Prisma client singleton
│       ├── stripe.ts                  # Stripe client + helpers
│       ├── github.ts                  # Octokit + GitHub API helpers
│       └── scanner.ts                 # hashmark wrapper
└── .env.example
```

## Data Flow

### 1. User Signs Up
```
User clicks "Sign in with GitHub"
    → NextAuth redirects to GitHub OAuth
    → GitHub returns access_token + user profile
    → NextAuth creates User + Account in Postgres
    → User redirected to /dashboard
```

### 2. User Connects a Repo
```
Dashboard loads user's GitHub repos via Octokit
    → User clicks "Connect" on a repo
    → Server Action creates Repository record in Postgres
    → Optional: Triggers initial scan
```

### 3. Manual Scan (Free Tier)
```
User clicks "Scan" on connected repo
    → POST /api/scan { repoId }
    → Server creates Scan record (status: PENDING)
    → Background: Clone repo (shallow) to temp dir
    → Run: npx hashmark-cli <path> --json
    → Parse JSON output into scan results
    → Store results in Scan record (status: COMPLETED)
    → Generate all 7 file formats
    → Store GeneratedFile records
    → User sees results in dashboard
```

### 4. Auto-Sync (Pro Tier)
```
User clicks "Install Action"
    → Hashmark generates .github/workflows/hashmark.yml
    → Creates file in user's repo via GitHub Contents API
    → Sets actionInstalled: true on Repository record

On every push to main:
    → GitHub Action runs in repo CI
    → Runs hashmark scanners
    → Generates all 7 formats
    → Auto-commits changed files
    → (Optional) Webhook notifies Hashmark to update dashboard
```

### 5. Payment Flow
```
User clicks "Upgrade to Pro"
    → Redirect to Stripe Checkout (with price_id)
    → User completes payment
    → Stripe webhook: checkout.session.completed
    → Update User.plan to PRO
    → Update User.stripeCustomerId
    → Pro features unlocked
```

## Database Schema

See `prisma/schema.prisma` for full schema. Key models:

- **User** — GitHub auth, plan tier, Stripe customer
- **Repository** — Connected GitHub repos
- **Scan** — Scan results (JSON), stats, status
- **GeneratedFile** — Each output format content
- **CustomRule** — User-defined context rules

## Security Considerations

- GitHub OAuth tokens stored encrypted in Account table (NextAuth handles this)
- Stripe webhook signature verification
- Rate limiting on scan API (prevent abuse)
- Repo access validated against user's GitHub permissions
- No source code stored — only scan metadata and generated context files
- Temp clone directories cleaned up after scan
