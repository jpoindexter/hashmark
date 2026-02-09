# Hashmark — UX Specification

Complete page-by-page specification for all Hashmark dashboard and marketing pages. Each page is documented with layout, data requirements, content, components, states, actions, and responsive behavior. A developer should be able to build each page directly from this spec.

---

## Table of Contents

1. [Information Architecture](#information-architecture)
2. [Navigation Structure](#navigation-structure)
3. [Design System Reference](#design-system-reference)
4. [Page Specifications](#page-specifications)
   - [/ (Landing)](#-landing--done)
   - [/pricing](#pricing)
   - [/login](#login)
   - [/dashboard](#dashboard)
   - [/dashboard/repos](#dashboardrepos)
   - [/dashboard/[repoId]](#dashboardrepoid)
   - [/dashboard/[repoId]/files](#dashboardrepoidfiles)
   - [/dashboard/[repoId]/history](#dashboardrepoidhistory)
   - [/dashboard/settings](#dashboardsettings)
   - [/dashboard/billing](#dashboardbilling)
5. [Shared Components](#shared-components)
6. [API Route Summary](#api-route-summary)

---

## Information Architecture

```
hashmark.md
├── / (Landing)                          PUBLIC    — Hero, How It Works, Formats, CLI, Pricing, Footer
├── /pricing                             PUBLIC    — Dedicated pricing comparison page
├── /login                               PUBLIC    — GitHub OAuth sign-in
│
├── /dashboard                           AUTH      — Overview: KPIs, recent activity, quick actions
├── /dashboard/repos                     AUTH      — All connected repos list + connect new
├── /dashboard/[repoId]                  AUTH      — Single repo intelligence dashboard
├── /dashboard/[repoId]/files            AUTH      — Generated context files viewer + download
├── /dashboard/[repoId]/history          AUTH      — Scan history timeline + diffs
├── /dashboard/settings                  AUTH      — Profile, custom rules, notifications
├── /dashboard/billing                   AUTH      — Plan management, Stripe portal, invoices
│
├── /api/auth/[...nextauth]              API       — NextAuth handler
├── /api/scan                            API       — POST trigger scan, GET scan status
├── /api/repos                           API       — CRUD connected repositories
├── /api/webhooks/stripe                 API       — Stripe webhook receiver
└── /api/webhooks/github                 API       — GitHub push event receiver
```

### Route Groups

| Group | Path Pattern | Layout | Auth Required |
|-------|-------------|--------|---------------|
| `(marketing)` | `/`, `/pricing`, `/login` | Marketing layout (nav bar, no sidebar) | No |
| `(dashboard)` | `/dashboard/**` | Dashboard layout (sidebar + header) | Yes (redirect to `/login`) |

---

## Navigation Structure

### Marketing Navigation (top bar)

```
┌─────────────────────────────────────────────────────────────┐
│  # HASHMARK          PRICING   CLI   DOCS      > SIGN IN   │
└─────────────────────────────────────────────────────────────┘
```

- Logo: `#` in `text-accent` + "HASHMARK" uppercase, links to `/`
- PRICING links to `/pricing`
- CLI links to npm page (external)
- DOCS links to docs (external, future)
- `> SIGN IN` button links to `/login`
- When authenticated: `> SIGN IN` becomes `> DASHBOARD` linking to `/dashboard`

### Dashboard Sidebar Navigation

```
┌──────────────────┐
│  # HASHMARK       │
│                    │
│  OVERVIEW          │  /dashboard
│  REPOSITORIES      │  /dashboard/repos
│                    │
│  ─────────────     │
│  SETTINGS          │  /dashboard/settings
│  BILLING           │  /dashboard/billing
│                    │
│  ─────────────     │
│  [user avatar]     │
│  user@email.com    │
│  > SIGN OUT        │
└──────────────────┘
```

Width: 240px fixed on desktop, collapsible drawer on mobile.

### Dashboard Header (top bar, to the right of sidebar)

```
┌──────────────────────────────────────────────────────────┐
│  Breadcrumb: DASHBOARD > REPOS > repo-name     [?] [#]  │
└──────────────────────────────────────────────────────────┘
```

- Breadcrumbs: uppercase, separated by `>`, each segment is a link
- Right side: help link `[?]`, notification indicator (future)
- Plan badge: Shows `[FREE]`, `[PRO]`, or `[TEAM]` next to breadcrumbs

### Dashboard Sub-navigation (repo detail pages)

When on `/dashboard/[repoId]` or its sub-routes, display horizontal tabs below the header:

```
┌──────────────────────────────────────────────────────────┐
│  INTELLIGENCE    FILES    HISTORY                         │
└──────────────────────────────────────────────────────────┘
```

| Tab | Route | Description |
|-----|-------|-------------|
| INTELLIGENCE | `/dashboard/[repoId]` | Codebase analysis dashboard |
| FILES | `/dashboard/[repoId]/files` | Generated context files |
| HISTORY | `/dashboard/[repoId]/history` | Scan history + diffs |

Active tab: `border-b-2 border-accent text-accent`. Inactive: `text-muted-foreground`.

---

## Design System Reference

### Colors (from globals.css)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#09090b` (zinc-950) | Page backgrounds |
| `--foreground` | `#fafafa` (zinc-100) | Primary text |
| `--muted` | `#18181b` (zinc-900) | Card backgrounds, input backgrounds |
| `--muted-foreground` | `#a1a1aa` (zinc-400) | Secondary text, placeholders |
| `--border` | `#27272a` (zinc-800) | All borders |
| `--accent` | `#10b981` (emerald-500) | Brand accent, success states, `#` motif |
| `--accent-foreground` | `#ecfdf5` | Text on accent background |

### Additional Semantic Colors

| Class | Usage |
|-------|-------|
| `text-emerald-400` | Success indicators, active states, the `#` brand motif |
| `text-amber-400` | Warnings, attention needed |
| `text-red-400` | Errors, destructive actions |
| `text-blue-400` | Informational, links (rare, prefer accent) |

### Typography

- Font: Geist Mono (`--font-geist-mono`), fallback `ui-monospace, monospace`
- All text is monospace. No sans-serif anywhere.
- Headings: UPPERCASE, `tracking-wider`
- Buttons: UPPERCASE with `>` prefix, `tracking-wider`
- Labels/badges: UPPERCASE, e.g. `[FREE]`, `[SCANNING]`, `[7 FORMATS]`
- Body text: Normal sentence case

### Component Patterns

| Element | Classes |
|---------|---------|
| Card | `bg-muted border border-border rounded-lg p-6` |
| Input | `bg-muted border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none` |
| Primary button | `bg-accent text-background px-6 py-2 rounded-lg uppercase tracking-wider font-bold hover:bg-accent/90` |
| Ghost button | `border border-border px-4 py-2 rounded-lg uppercase tracking-wider hover:bg-muted` |
| Destructive button | `border border-red-800 text-red-400 px-4 py-2 rounded-lg uppercase tracking-wider hover:bg-red-950` |
| Badge | `inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-wider border rounded` |
| Table | `w-full text-left text-sm` with `border-b border-border` rows, `text-muted-foreground` headers |
| Code block | `bg-zinc-900 border border-border rounded-lg p-4 font-mono text-sm overflow-x-auto` |
| Terminal output | `bg-zinc-900 border border-border rounded-lg p-4 font-mono text-sm text-emerald-400` |

### FABRK Component Mapping

When FABRK packages are integrated, map to these components:

| Hashmark Usage | FABRK Component | Package |
|----------------|-----------------|---------|
| Stat cards | `KPICard` | `@fabrk/components` |
| Charts | `BarChart`, `LineChart` | `@fabrk/components` |
| Data tables | `DataTable` | `@fabrk/components` |
| Status badges | `Badge` | `@fabrk/components` |
| Cards | `Card` | `@fabrk/components` |
| Buttons | `Button` | `@fabrk/components` |
| Inputs | `Input` | `@fabrk/components` |
| Selects | `Select` | `@fabrk/components` |
| Tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `@fabrk/components` |
| Dialogs | `Dialog` | `@fabrk/components` |
| Toast notifications | `Toast` | `@fabrk/components` |
| `cn()` utility | `cn` | `@fabrk/core` |
| Design tokens | `mode` | `@fabrk/design-system` |

Until FABRK packages are wired up, build with Tailwind utility classes matching the design tokens above.

---

## Page Specifications

---

### / (Landing) — DONE

Already built. 6 components: Hero, HowItWorks, Formats, CliSection, PricingTable, Footer. Uses marketing nav (top bar). No changes needed.

**Route**: `src/app/page.tsx`
**Route group**: None (root)

---

### /pricing

**Purpose**: Dedicated pricing page for SEO and direct linking. More detailed than the landing page pricing table, includes FAQ and feature comparison.

**Route**: `src/app/(marketing)/pricing/page.tsx`

#### Layout

- Marketing nav (top bar)
- Full-width content, `max-w-5xl mx-auto`
- Footer

#### Data Requirements

- None (static page)
- Stripe price IDs for checkout links (env vars)

#### Content

```
┌──────────────────────────────────────────────────────────────┐
│                         PRICING NAV                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    SIMPLE PRICING                            │
│          One price. All formats. Every scan.                 │
│                                                              │
│  ┌────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │   FREE     │  │   PRO          │  │   TEAM         │     │
│  │   $0/mo    │  │   $19/mo       │  │   $29/seat/mo  │     │
│  │            │  │                │  │                │     │
│  │  1 repo    │  │  Unlimited     │  │  Unlimited     │     │
│  │  Manual    │  │  Auto-sync     │  │  Auto-sync     │     │
│  │  scan      │  │  Scan history  │  │  Org rules     │     │
│  │  All       │  │  Custom rules  │  │  Team dash     │     │
│  │  formats   │  │  Full dash     │  │  Full dash     │     │
│  │            │  │                │  │                │     │
│  │ > GET      │  │ > UPGRADE      │  │ > CONTACT      │     │
│  │   STARTED  │  │   TO PRO       │  │   SALES        │     │
│  └────────────┘  └────────────────┘  └────────────────┘     │
│                                                              │
│  ─────────────── FEATURE COMPARISON ──────────────────       │
│                                                              │
│  Feature                    Free    Pro     Team             │
│  ─────────────────────────────────────────────────           │
│  Connected repos            1       Unlim   Unlim            │
│  Manual scan via web UI     Yes     Yes     Yes              │
│  Auto-sync (GitHub Action)  --      Yes     Yes              │
│  All 8 output formats       Yes     Yes     Yes              │
│  Download formats           Yes     Yes     Yes              │
│  Intelligence dashboard     Basic   Full    Full             │
│  Custom rules               --      Yes     Yes              │
│  Scan history + diffs       --      Yes     Yes              │
│  Org-wide rules             --      --      Yes              │
│  Team dashboard             --      --      Yes              │
│  Invite members             --      --      Yes              │
│  Priority support           --      --      Yes              │
│                                                              │
│  ─────────────────── FAQ ────────────────────                │
│                                                              │
│  Q: What happens when I hit my repo limit?                   │
│  Q: Can I cancel anytime?                                    │
│  Q: Do you store my source code?                             │
│  Q: Which AI tools are supported?                            │
│  Q: How does auto-sync work?                                 │
│  Q: What scanners do you use?                                │
│                                                              │
│                          FOOTER                              │
└──────────────────────────────────────────────────────────────┘
```

#### Components

- **PricingCard** (x3): Card with plan name, price, feature list, CTA button
  - Free card: ghost button `> GET STARTED` links to `/login`
  - Pro card: accent button `> UPGRADE TO PRO`, highlighted border (`border-accent`)
  - Team card: ghost button `> CONTACT SALES` links to mailto or Calendly
- **FeatureComparisonTable**: Full-width table, `DataTable` pattern
  - Features as rows, plans as columns
  - Checkmarks in `text-accent`, dashes in `text-muted-foreground`
- **FAQAccordion**: Collapsible Q/A items
  - Question: UPPERCASE, clickable
  - Answer: Normal case, `text-muted-foreground`
  - Expand/collapse with `+`/`-` indicator

#### States

- **Default**: Static content, no loading states needed
- **Authenticated user**: CTA buttons change text — Pro becomes `> UPGRADE` if on Free, `> CURRENT PLAN` (disabled) if already Pro

#### Actions

| Action | Behavior |
|--------|----------|
| Click Free CTA | Navigate to `/login` |
| Click Pro CTA | Navigate to `/login` (unauthenticated) or Stripe Checkout (authenticated) |
| Click Team CTA | Open mailto or Calendly link |
| Click FAQ question | Toggle answer visibility |

#### Mobile

- Pricing cards stack vertically (1 column)
- Feature comparison table scrolls horizontally
- FAQ remains full-width, works well at any size

---

### /login

**Purpose**: Sign in with GitHub OAuth. Simple, focused page. No distractions.

**Route**: `src/app/(marketing)/login/page.tsx`

#### Layout

- Marketing nav (top bar), minimal
- Centered content card
- No footer (keep it focused)

#### Data Requirements

- NextAuth `signIn("github")` action
- Redirect URL: `/dashboard` on success

#### Content

```
┌──────────────────────────────────────────────────────────────┐
│  # HASHMARK                                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│               ┌─────────────────────────┐                    │
│               │                         │                    │
│               │    # HASHMARK           │                    │
│               │                         │                    │
│               │    SIGN IN              │                    │
│               │                         │                    │
│               │    Connect your GitHub  │                    │
│               │    account to start     │                    │
│               │    scanning.            │                    │
│               │                         │                    │
│               │  ┌───────────────────┐  │                    │
│               │  │ [GH] > SIGN IN    │  │                    │
│               │  │   WITH GITHUB     │  │                    │
│               │  └───────────────────┘  │                    │
│               │                         │                    │
│               │  By signing in, you     │                    │
│               │  agree to our Terms     │                    │
│               │  and Privacy Policy.    │                    │
│               │                         │                    │
│               └─────────────────────────┘                    │
│                                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Components

- **Card**: Centered, `max-w-md`, with `bg-muted border border-border rounded-lg p-8`
- **Button**: Full-width accent button with GitHub icon (SVG) and `> SIGN IN WITH GITHUB`
- **Text**: Small `text-muted-foreground` legal text at bottom

#### States

| State | Display |
|-------|---------|
| Default | Sign-in button active |
| Loading | Button shows `> SIGNING IN...` with subtle pulse animation, disabled |
| Error | Red text below button: `[ERROR] Authentication failed. Try again.` |
| Already authenticated | Redirect to `/dashboard` immediately (server-side check) |

#### Actions

| Action | Behavior |
|--------|----------|
| Click sign-in button | Call `signIn("github", { callbackUrl: "/dashboard" })` |
| Click Terms link | Open terms page (external) |
| Click Privacy link | Open privacy page (external) |

#### Mobile

- Card takes full width with `mx-4` padding
- Button remains full-width
- Vertically centered via `min-h-screen flex items-center justify-center`

---

### /dashboard

**Purpose**: Overview page after login. Shows aggregate stats across all repos, recent scan activity, and quick actions. This is the user's home base.

**Route**: `src/app/(dashboard)/dashboard/page.tsx`

#### Layout

- Dashboard layout (sidebar + header)
- Breadcrumb: `DASHBOARD`
- Full content area

#### Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| User profile | `getSession()` | Name, email, plan, avatar |
| Connected repos count | `prisma.repository.count({ where: { userId } })` | Total repos |
| Total scans | `prisma.scan.count({ where: { repository: { userId } } })` | All-time |
| Latest scans | `prisma.scan.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { repository: true } })` | Recent activity |
| Aggregate stats | Computed from latest scan per repo | Files, lines, components, API routes |
| Plan limits | Derived from `user.plan` | Repo limit for Free tier |

#### Content

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  DASHBOARD                           [FREE]       │
│ SIDEBAR  ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐│
│          │  │ REPOS    │ │ TOTAL    │ │ FORMATS  │ │SCANS ││
│          │  │ 3        │ │ SCANS    │ │ IN SYNC  │ │TODAY ││
│          │  │ connected│ │ 47       │ │ 8        │ │ 2    ││
│          │  └──────────┘ └──────────┘ └──────────┘ └──────┘│
│          │                                                   │
│          │  RECENT ACTIVITY                                  │
│          │  ─────────────────────────────────────────────     │
│          │  [COMPLETED]  hashmark         2 min ago          │
│          │               271 files, 45K lines, 0.8s          │
│          │  [COMPLETED]  fabrk-framework  1 hour ago         │
│          │               1,572 files, 365K lines, 2.1s       │
│          │  [FAILED]     old-project      3 hours ago        │
│          │               Error: Repository not found         │
│          │  [COMPLETED]  my-saas          Yesterday          │
│          │               89 files, 12K lines, 0.3s           │
│          │                                                   │
│          │  QUICK ACTIONS                                    │
│          │  ─────────────────────────────────────────────     │
│          │  ┌─────────────────┐  ┌─────────────────────┐     │
│          │  │ > CONNECT REPO  │  │ > SCAN ALL REPOS    │     │
│          │  └─────────────────┘  └─────────────────────┘     │
│          │                                                   │
│          │  PLAN USAGE                                       │
│          │  ─────────────────────────────────────────────     │
│          │  Repos: 1/1 [████████████████████] 100%           │
│          │  > UPGRADE TO PRO for unlimited repos             │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

#### Components

| Element | Component | Props/Details |
|---------|-----------|---------------|
| Stat cards (x4) | `KPICard` | title (UPPERCASE), value (large number), subtitle (description) |
| Recent activity list | Custom `ActivityFeed` | List of scan events with status badge, repo name, timestamp, stats |
| Status badge | `Badge` | `[COMPLETED]` in emerald, `[SCANNING]` in amber pulse, `[FAILED]` in red, `[PENDING]` in muted |
| Quick action buttons | `Button` (ghost) | `> CONNECT REPO`, `> SCAN ALL REPOS` |
| Plan usage bar | Custom `UsageBar` | Progress bar showing repo count vs limit, accent color for bar fill |
| Upgrade CTA | Inline text link | `text-accent` link to `/dashboard/billing` |

#### States

| State | Display |
|-------|---------|
| **Loading** | 4 skeleton KPICards (pulsing bg-muted rectangles), skeleton list rows |
| **Empty** (new user, no repos) | KPIs show 0s. Activity section replaced with onboarding card: "WELCOME TO HASHMARK" heading, 3-step instructions (Connect, Scan, Sync), single `> CONNECT YOUR FIRST REPO` accent button |
| **Error** (API failure) | Red banner at top: `[ERROR] Failed to load dashboard. Retrying...` with auto-retry |
| **Free tier at limit** | Usage bar full (red), prominent upgrade CTA |

#### Actions

| Action | Behavior |
|--------|----------|
| Click KPI card (REPOS) | Navigate to `/dashboard/repos` |
| Click repo name in activity | Navigate to `/dashboard/[repoId]` |
| Click `> CONNECT REPO` | Navigate to `/dashboard/repos` with connect modal open (via query param `?connect=true`) |
| Click `> SCAN ALL REPOS` | Server action: enqueue scan for all repos. Button changes to `> SCANNING...` (disabled) |
| Click `> UPGRADE TO PRO` | Navigate to `/dashboard/billing` |
| Click activity item | Navigate to `/dashboard/[repoId]` |

#### Mobile

- KPI cards: 2-column grid on tablet, single column stack on phone
- Sidebar collapses to hamburger menu
- Activity feed: full-width, timestamp below repo name instead of inline
- Quick action buttons stack vertically

---

### /dashboard/repos

**Purpose**: View all connected repositories. Connect new ones from GitHub. Manage existing connections. This is the primary "inventory" view.

**Route**: `src/app/(dashboard)/dashboard/repos/page.tsx`

#### Layout

- Dashboard layout (sidebar + header)
- Breadcrumb: `DASHBOARD > REPOSITORIES`

#### Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| Connected repos | `prisma.repository.findMany({ where: { userId }, include: { scans: { take: 1, orderBy: { createdAt: 'desc' } } } })` | With latest scan |
| GitHub repos (for connect) | `octokit.repos.listForAuthenticatedUser()` | Paginated, sorted by updated |
| Plan | `user.plan` | For repo limit enforcement |

#### Content

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  DASHBOARD > REPOSITORIES               [PRO]     │
│ SIDEBAR  ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  REPOSITORIES                   > CONNECT REPO    │
│          │                                                   │
│          │  Search repos...                [Filter ▾]        │
│          │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │  jpoindexter/hashmark              [PUBLIC] │  │
│          │  │  TypeScript  ·  271 files  ·  45K lines     │  │
│          │  │  Last scan: 2 min ago [COMPLETED]           │  │
│          │  │  Action: [INSTALLED]                        │  │
│          │  │                     > VIEW   > SCAN   ···   │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │  jpoindexter/fabrk-framework       [PUBLIC] │  │
│          │  │  TypeScript  ·  1,572 files  ·  365K lines  │  │
│          │  │  Last scan: 1 hour ago [COMPLETED]          │  │
│          │  │  Action: [NOT INSTALLED]                    │  │
│          │  │                     > VIEW   > SCAN   ···   │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │  jpoindexter/my-saas               [PRIVATE]│  │
│          │  │  TypeScript  ·  89 files  ·  12K lines      │  │
│          │  │  Last scan: Yesterday [COMPLETED]           │  │
│          │  │  Action: [INSTALLED]                        │  │
│          │  │                     > VIEW   > SCAN   ···   │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  Showing 3 of 3 repositories                      │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

#### Connect Repo Dialog (modal)

Triggered by `> CONNECT REPO` button:

```
┌─────────────────────────────────────────────┐
│  CONNECT REPOSITORY                    [X]  │
│                                             │
│  Search your GitHub repos...                │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │  jpoindexter/new-project     [PUBLIC] │  │
│  │  TypeScript  ·  Updated 2 days ago    │  │
│  │                         > CONNECT     │  │
│  ├───────────────────────────────────────┤  │
│  │  jpoindexter/another-repo   [PRIVATE] │  │
│  │  Python  ·  Updated 1 week ago        │  │
│  │                         > CONNECT     │  │
│  ├───────────────────────────────────────┤  │
│  │  jpoindexter/hashmark    [CONNECTED]  │  │
│  │  TypeScript  ·  Already connected     │  │
│  │                         (connected)   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Showing 3 of 47 repos  > LOAD MORE        │
│                                             │
└─────────────────────────────────────────────┘
```

#### Components

| Element | Component | Props/Details |
|---------|-----------|---------------|
| Repo cards | `Card` | Each repo as a card with metadata, badges, action buttons |
| Status badges | `Badge` | `[PUBLIC]`/`[PRIVATE]` in muted, `[COMPLETED]`/`[FAILED]`/`[SCANNING]` for scan status |
| Action badge | `Badge` | `[INSTALLED]` in emerald, `[NOT INSTALLED]` in muted |
| Search input | `Input` | Placeholder "Search repos...", filters client-side |
| Filter dropdown | `Select` | Filter by: All, Has Action, Needs Scan, Failed |
| Connect button | `Button` (accent) | `> CONNECT REPO` in header area |
| Repo action buttons | `Button` (ghost, small) | `> VIEW`, `> SCAN`, overflow menu `...` |
| Connect dialog | `Dialog` | Modal with GitHub repo list, search, connect buttons |
| Overflow menu | Dropdown | `> INSTALL ACTION`, `> DISCONNECT`, `> VIEW ON GITHUB` |

#### States

| State | Display |
|-------|---------|
| **Loading** | 3 skeleton repo cards (pulsing) |
| **Empty** (no repos connected) | Full-page empty state: large `#` icon, "NO REPOSITORIES CONNECTED" heading, "Connect your first GitHub repo to start scanning." body text, single `> CONNECT YOUR FIRST REPO` accent button |
| **Connecting** | Dialog shows spinner on the repo being connected, button becomes `> CONNECTING...` |
| **Scanning** | Repo card shows `[SCANNING]` badge with amber pulse animation, `> SCAN` button disabled |
| **Free at limit** | `> CONNECT REPO` button disabled with tooltip: "Free plan: 1 repo max. Upgrade to Pro for unlimited." |
| **Error** | Individual repo cards can show error state: `[FAILED]` badge with error message in `text-red-400` |

#### Actions

| Action | Behavior |
|--------|----------|
| Click `> CONNECT REPO` | Open connect dialog |
| Click `> CONNECT` in dialog | Server action: create Repository record, close dialog, show new repo card |
| Click `> VIEW` | Navigate to `/dashboard/[repoId]` |
| Click `> SCAN` | Server action: trigger scan, show scanning state |
| Click `> INSTALL ACTION` | Server action: create workflow file via GitHub API, update badge to `[INSTALLED]` |
| Click `> DISCONNECT` | Confirmation dialog, then server action: delete Repository + Scans |
| Click `> VIEW ON GITHUB` | Open repo URL in new tab |
| Search input | Client-side filter by repo name |
| Filter dropdown | Client-side filter by status |

#### Mobile

- Repo cards: full-width stack
- Search and filter: stack vertically
- Connect dialog: full-screen sheet (slides up from bottom)
- Action buttons: collapse into overflow menu `...`

---

### /dashboard/[repoId]

**Purpose**: The codebase intelligence dashboard for a single repository. Shows scan results as KPIs, charts, and categorized data tables. This is the main value display of Hashmark.

**Route**: `src/app/(dashboard)/dashboard/[repoId]/page.tsx`

#### Layout

- Dashboard layout (sidebar + header)
- Breadcrumb: `DASHBOARD > REPOS > {repo-name}`
- Sub-navigation tabs: `INTELLIGENCE | FILES | HISTORY`
- Active tab: INTELLIGENCE

#### Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| Repository | `prisma.repository.findUnique({ where: { id: repoId, userId } })` | Verify ownership |
| Latest scan | `prisma.scan.findFirst({ where: { repositoryId }, orderBy: { createdAt: 'desc' } })` | Most recent scan results |
| Scan results (JSON) | `scan.results` | Parsed JSON from agent-smith output |
| Generated files count | `prisma.generatedFile.count({ where: { scanId } })` | Number of formats generated |

**Scan Results JSON Structure** (from agent-smith output):

```typescript
interface ScanResults {
  stats: {
    fileCount: number
    lineCount: number
    componentCount: number
    apiRouteCount: number
    modelCount: number
    tokenEstimate: number
    hookCount: number
    utilityCount: number
  }
  components: Array<{ name: string, path: string, props: string[], variants?: number }>
  apiRoutes: Array<{ path: string, method: string, auth: boolean, description?: string }>
  models: Array<{ name: string, fields: number, relations: number }>
  hooks: Array<{ name: string, path: string, description?: string }>
  patterns: Array<{ name: string, description: string, usage: string }>
  antiPatterns: Array<{ description: string, wrong: string, right: string, file?: string }>
  complexity: Array<{ file: string, score: number, reason: string }>
  tokens: Array<{ name: string, value: string, category: string }>
  envVars: Array<{ name: string, required: boolean, description?: string }>
  framework: { name: string, version: string, features: string[] }
}
```

#### Content

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  DASHBOARD > REPOS > hashmark            [PRO]    │
│ SIDEBAR  ├───────────────────────────────────────────────────┤
│          │  INTELLIGENCE   FILES   HISTORY                    │
│          ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│          │  │ FILES  │ │ LINES  │ │ COMPS  │ │ API    │     │
│          │  │ 271    │ │ 45,291 │ │ 12     │ │ ROUTES │     │
│          │  │        │ │        │ │        │ │ 8      │     │
│          │  └────────┘ └────────┘ └────────┘ └────────┘     │
│          │                                                   │
│          │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│          │  │ MODELS │ │ HOOKS  │ │ TOKENS │ │ EST.   │     │
│          │  │ 5      │ │ 7      │ │ ~24K   │ │ COMPL. │     │
│          │  │        │ │        │ │        │ │ 3.2    │     │
│          │  └────────┘ └────────┘ └────────┘ └────────┘     │
│          │                                                   │
│          │  FRAMEWORK                                        │
│          │  ─────────────────────────────────────────────     │
│          │  Next.js 16.1.6 (App Router)                      │
│          │  TypeScript 5.9  ·  Tailwind v4  ·  Prisma 6      │
│          │                                                   │
│          │  COMPONENTS                        > VIEW ALL     │
│          │  ─────────────────────────────────────────────     │
│          │  Name              Path                Props      │
│          │  Hero              src/comp../hero.tsx  --         │
│          │  HowItWorks        src/comp../how..     --         │
│          │  PricingTable      src/comp../pri..     plans      │
│          │  Footer            src/comp../foo..     --         │
│          │  ... (showing 4 of 12)                            │
│          │                                                   │
│          │  API ROUTES                        > VIEW ALL     │
│          │  ─────────────────────────────────────────────     │
│          │  Method   Path               Auth                 │
│          │  POST     /api/scan           Yes                 │
│          │  GET      /api/repos          Yes                 │
│          │  POST     /api/webhooks/..    No (webhook)        │
│          │  ... (showing 3 of 8)                             │
│          │                                                   │
│          │  COMPLEXITY HOTSPOTS               > VIEW ALL     │
│          │  ─────────────────────────────────────────────     │
│          │  File                     Score   Issue            │
│          │  src/lib/scanner.ts       8.7     High nesting    │
│          │  packages/cli/cli.ts      7.2     868 lines       │
│          │  ... (top 5 shown)                                │
│          │                                                   │
│          │  ANTI-PATTERNS                     > VIEW ALL     │
│          │  ─────────────────────────────────────────────     │
│          │  [WARNING] Hardcoded color values                 │
│          │  WRONG: className="bg-blue-500"                   │
│          │  RIGHT: className="bg-primary"                    │
│          │                                                   │
│          │  [WARNING] Missing error boundary                 │
│          │  ... (showing 2 of N)                             │
│          │                                                   │
│          │  LAST SCAN                                        │
│          │  2 minutes ago  ·  0.8s duration  ·  commit a1b2c │
│          │                          > RESCAN   > VIEW FILES  │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

#### Components

| Element | Component | Props/Details |
|---------|-----------|---------------|
| KPI cards (8) | `KPICard` | Two rows of 4. Title uppercase, value large, subtitle optional |
| Framework info | Custom `FrameworkBanner` | Card with framework name, version, detected features as badges |
| Components table | `DataTable` | Columns: Name, Path (truncated), Props. Sortable. First 4 rows shown |
| API routes table | `DataTable` | Columns: Method (badge), Path, Auth (yes/no badge). Sortable |
| Complexity table | `DataTable` | Columns: File (truncated path), Score (color-coded), Issue. Sorted by score desc |
| Anti-patterns list | Custom `AntiPatternCard` | Warning badge, description, WRONG/RIGHT code blocks |
| Scan info bar | Custom inline | Timestamp, duration, commit SHA (truncated), action buttons |
| Section headers | `h2` | UPPERCASE with `> VIEW ALL` link aligned right |
| `> VIEW ALL` links | Text link | `text-accent`, navigates to expanded view (future) or scrolls |
| `> RESCAN` button | `Button` (ghost) | Triggers new scan |
| `> VIEW FILES` button | `Button` (accent) | Navigates to `/dashboard/[repoId]/files` |

#### States

| State | Display |
|-------|---------|
| **Loading** | Skeleton KPI cards (8), skeleton tables |
| **No scans yet** | KPIs all show `--`. Content area shows: "NO SCAN DATA" heading, "Run your first scan to see codebase intelligence." body, `> RUN FIRST SCAN` accent button |
| **Scanning in progress** | Banner at top: `[SCANNING] Analyzing repository... This may take 10-30 seconds.` with progress pulse. KPIs show previous values (if any) or `--` |
| **Scan failed** | Red banner: `[FAILED] Scan error: {error message}. > RETRY` |
| **Stale scan** (over 7 days old) | Amber banner: `[STALE] Last scan was 12 days ago. > RESCAN to update.` |

#### Actions

| Action | Behavior |
|--------|----------|
| Click `> RESCAN` | Server action: trigger new scan, show scanning state |
| Click `> VIEW FILES` | Navigate to `/dashboard/[repoId]/files` |
| Click `> VIEW ALL` on any section | Expand section to show all items (or navigate to filtered view) |
| Click component name | Copy component import to clipboard, show toast |
| Click file path | Open on GitHub in new tab |
| Click commit SHA | Open commit on GitHub in new tab |
| Tab navigation | Switch between INTELLIGENCE / FILES / HISTORY |

#### Mobile

- KPI cards: 2-column grid
- Tables: horizontal scroll or card-based layout (each row becomes a mini-card)
- Anti-pattern code blocks: horizontal scroll with `overflow-x-auto`
- Sub-nav tabs: horizontal scroll if needed
- Section `> VIEW ALL` links: below section title instead of inline right

---

### /dashboard/[repoId]/files

**Purpose**: View, preview, and download all generated context files. The user can see exactly what each AI tool will receive. This is the "output" page.

**Route**: `src/app/(dashboard)/dashboard/[repoId]/files/page.tsx`

#### Layout

- Dashboard layout (sidebar + header)
- Breadcrumb: `DASHBOARD > REPOS > {repo-name} > FILES`
- Sub-navigation tabs: `INTELLIGENCE | FILES | HISTORY`
- Active tab: FILES

#### Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| Repository | `prisma.repository.findUnique(...)` | Verify ownership |
| Latest scan | `prisma.scan.findFirst(...)` | Most recent completed scan |
| Generated files | `prisma.generatedFile.findMany({ where: { scanId } })` | All format files for latest scan |

#### Content

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  DASHBOARD > REPOS > hashmark > FILES     [PRO]   │
│ SIDEBAR  ├───────────────────────────────────────────────────┤
│          │  INTELLIGENCE   FILES   HISTORY                    │
│          ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  GENERATED FILES              > DOWNLOAD ALL      │
│          │  Last generated: 2 min ago from scan #47          │
│          │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │  ┌──────────────────────────────────────┐   │  │
│          │  │  │ AGENTS.md           ~24K tokens      │   │  │
│          │  │  │ CLAUDE.md           ~18K tokens      │   │  │
│          │  │  │ .cursorrules        ~16K tokens      │   │  │
│          │  │  │ .cursor/rules/..mdc ~16K tokens      │   │  │
│          │  │  │ copilot-instru..    ~12K tokens      │   │  │
│          │  │  │ .windsurfrules      ~16K tokens      │   │  │
│          │  │  │ GEMINI.md           ~18K tokens      │   │  │
│          │  │  │ .clinerules         ~16K tokens      │   │  │
│          │  │  └──────────────────────────────────────┘   │  │
│          │  │                                             │  │
│          │  │  ┌──────────────────────────────────────┐   │  │
│          │  │  │  AGENTS.md                           │   │  │
│          │  │  │  ─────────────────────────────────   │   │  │
│          │  │  │  # hashmark                          │   │  │
│          │  │  │                                      │   │  │
│          │  │  │  > One scan. Every format. Always    │   │  │
│          │  │  │  in sync.                            │   │  │
│          │  │  │                                      │   │  │
│          │  │  │  ## Architecture                     │   │  │
│          │  │  │                                      │   │  │
│          │  │  │  - Next.js 16 (App Router)           │   │  │
│          │  │  │  - TypeScript 5.9                    │   │  │
│          │  │  │  - Prisma 6 + Postgres               │   │  │
│          │  │  │  ...                                 │   │  │
│          │  │  │                                      │   │  │
│          │  │  │  > COPY   > DOWNLOAD   > VIEW RAW   │   │  │
│          │  │  └──────────────────────────────────────┘   │  │
│          │  │                                             │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

#### Components

| Element | Component | Props/Details |
|---------|-----------|---------------|
| File list (left/top) | Custom `FileList` | Vertical list of file names with token counts. Selected item highlighted with `border-l-2 border-accent` |
| File preview (right/bottom) | Custom `FilePreview` | Code block with markdown rendering or raw text. Syntax-highlighted if possible |
| `> DOWNLOAD ALL` button | `Button` (accent) | Downloads ZIP of all format files |
| File action buttons | `Button` (ghost, small) | `> COPY`, `> DOWNLOAD`, `> VIEW RAW` per file |
| Token count | `Badge` | `~24K tokens` in muted style |
| Scan reference | Text | "Last generated: {relative time} from scan #{number}" in `text-muted-foreground` |

#### Layout Detail

Desktop: Two-panel layout. Left panel (280px) shows file list. Right panel shows file preview. Left panel items are clickable; clicking changes the right panel.

Mobile: Single column. File list at top as horizontal scroll tabs or accordion. Preview below.

#### States

| State | Display |
|-------|---------|
| **Loading** | Skeleton file list + skeleton preview block |
| **No files** (no scan completed) | Empty state: "NO FILES GENERATED" heading, "Run a scan to generate context files for all AI tools." body, `> RUN SCAN` button |
| **File selected** | Highlighted in file list, content shown in preview |
| **Copying** | `> COPY` button briefly becomes `> COPIED!` in emerald for 2 seconds |
| **Pro-gated** (Free tier, limited view) | Show all files in list but only allow preview/download of first format. Others show: `[PRO] Upgrade to preview all formats. > UPGRADE` |

#### Actions

| Action | Behavior |
|--------|----------|
| Click file in list | Show file content in preview panel |
| Click `> COPY` | Copy file content to clipboard, show toast: "Copied AGENTS.md to clipboard" |
| Click `> DOWNLOAD` | Download individual file |
| Click `> DOWNLOAD ALL` | Download ZIP of all files. Filename: `{repo-name}-context-files.zip` |
| Click `> VIEW RAW` | Open raw text in new tab or full-screen modal |

#### Mobile

- File list becomes horizontal scrollable tab bar at top
- Preview takes full width below
- Action buttons stack or become icon-only
- `> DOWNLOAD ALL` becomes floating action button at bottom

---

### /dashboard/[repoId]/history

**Purpose**: View scan history for a repository. Compare scans over time. See how the codebase has evolved. This is a Pro-tier feature.

**Route**: `src/app/(dashboard)/dashboard/[repoId]/history/page.tsx`

#### Layout

- Dashboard layout (sidebar + header)
- Breadcrumb: `DASHBOARD > REPOS > {repo-name} > HISTORY`
- Sub-navigation tabs: `INTELLIGENCE | FILES | HISTORY`
- Active tab: HISTORY

#### Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| Repository | `prisma.repository.findUnique(...)` | Verify ownership |
| All scans | `prisma.scan.findMany({ where: { repositoryId }, orderBy: { createdAt: 'desc' } })` | Full scan history |
| Scan stats over time | Computed from scans array | For trend charts |

#### Content

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  DASHBOARD > REPOS > hashmark > HISTORY   [PRO]   │
│ SIDEBAR  ├───────────────────────────────────────────────────┤
│          │  INTELLIGENCE   FILES   HISTORY                    │
│          ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  SCAN HISTORY                                     │
│          │                                                   │
│          │  CODEBASE TRENDS                                  │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │  [Line chart: files, components, API routes │  │
│          │  │   over time. X-axis: scan dates. Y-axis:    │  │
│          │  │   counts. 3 colored lines]                  │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  SCAN LOG                                         │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  #47  [COMPLETED]  Today, 2:15 PM                 │
│          │       271 files · 45,291 lines · 12 components    │
│          │       Duration: 0.8s · Commit: a1b2c3d            │
│          │       +3 files, +120 lines, +1 component          │
│          │                           > VIEW   > COMPARE      │
│          │                                                   │
│          │  #46  [COMPLETED]  Yesterday, 4:30 PM             │
│          │       268 files · 45,171 lines · 11 components    │
│          │       Duration: 0.7s · Commit: e4f5g6h            │
│          │       +15 files, +2,100 lines, +2 components      │
│          │                           > VIEW   > COMPARE      │
│          │                                                   │
│          │  #45  [FAILED]     Feb 7, 10:00 AM                │
│          │       Error: Repository clone timeout             │
│          │                                   > RETRY         │
│          │                                                   │
│          │  #44  [COMPLETED]  Feb 6, 3:00 PM                 │
│          │       253 files · 43,071 lines · 9 components     │
│          │       Duration: 0.6s · Commit: i7j8k9l            │
│          │                           > VIEW   > COMPARE      │
│          │                                                   │
│          │  Showing 4 of 47 scans          > LOAD MORE       │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

#### Components

| Element | Component | Props/Details |
|---------|-----------|---------------|
| Trend chart | `LineChart` | Multi-line chart showing files, components, API routes over scan dates |
| Scan log entries | Custom `ScanLogEntry` | Card-like rows with scan number, status badge, timestamp, stats, diff deltas, actions |
| Status badge | `Badge` | Same as elsewhere: `[COMPLETED]` emerald, `[FAILED]` red |
| Diff deltas | Inline text | `+3 files` in emerald, `-2 components` in red, `0 changes` in muted |
| `> VIEW` button | `Button` (ghost) | Navigate to intelligence view for that specific scan |
| `> COMPARE` button | `Button` (ghost) | Open side-by-side diff dialog |
| `> LOAD MORE` | `Button` (ghost) | Load next page of scan history |
| Compare dialog | `Dialog` | Side-by-side diff of two scans' generated files |

#### States

| State | Display |
|-------|---------|
| **Loading** | Skeleton chart + skeleton log entries |
| **No history** (only 1 scan) | Chart hidden. Single scan entry shown. Message: "Run more scans to see trends." |
| **Free tier** | Full page replaced with gate: "SCAN HISTORY" heading, "Upgrade to Pro to see your codebase's evolution over time." body, `> UPGRADE TO PRO` button. Show blurred/faded preview of what it would look like |
| **Error loading** | Red banner with retry |

#### Actions

| Action | Behavior |
|--------|----------|
| Click `> VIEW` | Navigate to `/dashboard/[repoId]` with `?scanId={id}` to view historical scan data |
| Click `> COMPARE` | Open compare dialog. Default: compare selected scan with previous scan |
| Click `> RETRY` (on failed scan) | Server action: re-trigger scan |
| Click `> LOAD MORE` | Fetch next 10 scans, append to list |
| Hover chart data point | Tooltip with scan number, date, exact values |

#### Mobile

- Chart: full-width, reduced height
- Scan log entries: full-width cards
- Compare dialog: full-screen sheet
- Diff deltas: below stats instead of inline

---

### /dashboard/settings

**Purpose**: User profile settings, custom rules management, notification preferences. Organized in tabbed or sectioned layout.

**Route**: `src/app/(dashboard)/dashboard/settings/page.tsx`

#### Layout

- Dashboard layout (sidebar + header)
- Breadcrumb: `DASHBOARD > SETTINGS`
- Content organized in vertical sections with clear dividers

#### Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| User profile | `getSession()` + `prisma.user.findUnique(...)` | Name, email, avatar, plan, createdAt |
| Custom rules | `prisma.customRule.findMany({ where: { userId } })` | All user rules |
| Connected account info | `prisma.account.findFirst({ where: { userId } })` | GitHub username, scopes |

#### Content

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  DASHBOARD > SETTINGS                     [PRO]   │
│ SIDEBAR  ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  PROFILE                                          │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  [Avatar]  Jason Poindexter                       │
│          │            jason@theft.studio                     │
│          │            Member since Feb 2026                  │
│          │                                                   │
│          │  GitHub Account                                   │
│          │  Connected as: jpoindexter                        │
│          │  Scopes: repo, read:user                          │
│          │                           > RECONNECT GITHUB      │
│          │                                                   │
│          │  ═══════════════════════════════════════════════   │
│          │                                                   │
│          │  CUSTOM RULES                     > ADD RULE      │
│          │  ─────────────────────────────────────────────     │
│          │  Add rules that are injected into every           │
│          │  generated context file.                          │
│          │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │  Always use design tokens             [ON]  │  │
│          │  │  Scope: [REPO]                              │  │
│          │  │  "Use bg-primary, text-foreground instead   │  │
│          │  │   of hardcoded colors like bg-blue-500"     │  │
│          │  │                          > EDIT   > DELETE   │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │  Prefer server components             [ON]  │  │
│          │  │  Scope: [REPO]                              │  │
│          │  │  "Default to React Server Components.       │  │
│          │  │   Only add 'use client' when needed."       │  │
│          │  │                          > EDIT   > DELETE   │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  ═══════════════════════════════════════════════   │
│          │                                                   │
│          │  NOTIFICATIONS                                    │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  Email on scan completion        [  ON  ]         │
│          │  Email on scan failure           [  ON  ]         │
│          │  Weekly digest                   [ OFF  ]         │
│          │                                                   │
│          │  ═══════════════════════════════════════════════   │
│          │                                                   │
│          │  DANGER ZONE                                      │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  > DELETE ACCOUNT                                 │
│          │  This will disconnect all repos, delete all       │
│          │  scan data, and cancel your subscription.         │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

#### Add/Edit Rule Dialog

```
┌─────────────────────────────────────────────┐
│  ADD CUSTOM RULE                       [X]  │
│                                             │
│  Rule name                                  │
│  ┌───────────────────────────────────────┐  │
│  │  e.g., Always use design tokens       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Description (optional)                     │
│  ┌───────────────────────────────────────┐  │
│  │  e.g., Explain why this rule exists   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Rule content                               │
│  ┌───────────────────────────────────────┐  │
│  │  The instruction to inject into       │  │
│  │  generated context files.             │  │
│  │                                       │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Scope                                      │
│  ( ) Per-repo    ( ) Organization-wide      │
│                                             │
│  Enabled  [ ON ]                            │
│                                             │
│         > CANCEL              > SAVE RULE   │
└─────────────────────────────────────────────┘
```

#### Components

| Element | Component | Props/Details |
|---------|-----------|---------------|
| Profile card | Custom section | Avatar (GitHub), name, email, member since, GitHub connection info |
| `> RECONNECT GITHUB` | `Button` (ghost) | Re-triggers GitHub OAuth to refresh token/scopes |
| Custom rule cards | `Card` | Rule name, scope badge, enabled toggle, rule text preview, edit/delete buttons |
| `> ADD RULE` button | `Button` (accent) | Opens add rule dialog |
| Rule dialog | `Dialog` | Form: name input, description textarea, rule content textarea, scope radio, enabled toggle |
| Toggle switches | Custom toggle | `[ON]`/`[OFF]` style, always `rounded-full` (pill shaped) |
| Notification toggles | Toggle + label | Three rows of toggle switches |
| `> DELETE ACCOUNT` | `Button` (destructive) | Red border, requires confirmation dialog |
| Section dividers | `<hr>` | `border-border` with spacing |

#### States

| State | Display |
|-------|---------|
| **Loading** | Skeleton profile section + skeleton rule cards |
| **No custom rules** | Empty rules section: "No custom rules yet. Add rules to inject specific instructions into every generated context file." + `> ADD YOUR FIRST RULE` button |
| **Free tier (rules)** | Rules section shows upgrade gate: "Custom rules are a Pro feature. > UPGRADE TO PRO" |
| **Saving** | Button becomes `> SAVING...` (disabled) |
| **Delete confirmation** | Dialog: "ARE YOU SURE?" heading, "This action cannot be undone." body, `> CANCEL` and `> DELETE` (red) buttons |

#### Actions

| Action | Behavior |
|--------|----------|
| Click `> RECONNECT GITHUB` | Re-trigger GitHub OAuth flow |
| Click `> ADD RULE` | Open add rule dialog |
| Click `> EDIT` on rule | Open edit dialog pre-filled with rule data |
| Click `> DELETE` on rule | Confirmation dialog, then server action: delete rule |
| Toggle rule enabled/disabled | Server action: update rule `enabled` field |
| Toggle notification settings | Server action: update user notification preferences |
| Click `> DELETE ACCOUNT` | Confirmation dialog with text input "DELETE" to confirm, then cascading delete |

#### Mobile

- All sections full-width, stacked
- Rule cards: full-width
- Dialog: full-screen sheet
- Toggle switches: right-aligned on same line as label

---

### /dashboard/billing

**Purpose**: Manage subscription plan. View invoices. Access Stripe customer portal. Upgrade or downgrade.

**Route**: `src/app/(dashboard)/dashboard/billing/page.tsx`

#### Layout

- Dashboard layout (sidebar + header)
- Breadcrumb: `DASHBOARD > BILLING`

#### Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| User plan | `user.plan` | Current tier: FREE, PRO, TEAM |
| Stripe customer | `stripe.customers.retrieve(user.stripeCustomerId)` | If exists |
| Subscription | `stripe.subscriptions.list({ customer: stripeCustomerId })` | Active sub details |
| Invoices | `stripe.invoices.list({ customer: stripeCustomerId, limit: 10 })` | Recent invoices |
| Usage stats | Computed | Repo count, scan count this month |

#### Content

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  DASHBOARD > BILLING                      [PRO]   │
│ SIDEBAR  ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  CURRENT PLAN                                     │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│          │  │                                             │  │
│          │  │  # PRO PLAN                                 │  │
│          │  │  $19/month                                  │  │
│          │  │                                             │  │
│          │  │  Status: [ACTIVE]                           │  │
│          │  │  Next billing: March 9, 2026                │  │
│          │  │  Payment: Visa ending 4242                  │  │
│          │  │                                             │  │
│          │  │  > MANAGE SUBSCRIPTION   > CHANGE PLAN      │  │
│          │  │                                             │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  USAGE THIS MONTH                                 │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  Repos connected:  3                               │
│          │  Scans run:        47                              │
│          │  Files generated:  329                             │
│          │                                                   │
│          │  AVAILABLE PLANS                                   │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  ┌──────────┐  ┌──────────────┐  ┌──────────┐    │
│          │  │  FREE    │  │  PRO ← YOU   │  │  TEAM    │    │
│          │  │  $0/mo   │  │  $19/mo      │  │  $29/mo  │    │
│          │  │  1 repo  │  │  Unlimited   │  │  per seat│    │
│          │  │          │  │  [CURRENT]   │  │          │    │
│          │  │ >DOWNGRADE│ │              │  │ >UPGRADE │    │
│          │  └──────────┘  └──────────────┘  └──────────┘    │
│          │                                                   │
│          │  INVOICES                                         │
│          │  ─────────────────────────────────────────────     │
│          │                                                   │
│          │  Date           Amount    Status     Action        │
│          │  Feb 9, 2026    $19.00    [PAID]     > VIEW        │
│          │  Jan 9, 2026    $19.00    [PAID]     > VIEW        │
│          │  Dec 9, 2025    $19.00    [PAID]     > VIEW        │
│          │                                                   │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

#### Components

| Element | Component | Props/Details |
|---------|-----------|---------------|
| Current plan card | `Card` | Highlighted with `border-accent`. Shows plan name, price, status, billing date, payment method |
| Status badge | `Badge` | `[ACTIVE]` in emerald, `[PAST_DUE]` in amber, `[CANCELED]` in red |
| `> MANAGE SUBSCRIPTION` | `Button` (ghost) | Opens Stripe Customer Portal (redirect) |
| `> CHANGE PLAN` | `Button` (ghost) | Scrolls to or focuses Available Plans section |
| Usage stats | Three rows of label + value | Simple text layout |
| Plan cards (x3) | `Card` | Compact pricing cards. Current plan marked with `[CURRENT]` badge + `border-accent`. Others show upgrade/downgrade button |
| Invoices table | `DataTable` | Columns: Date, Amount, Status badge, `> VIEW` link (opens Stripe invoice PDF) |
| `> VIEW` invoice link | Text link | Opens Stripe-hosted invoice URL in new tab |

#### States

| State | Display |
|-------|---------|
| **Loading** | Skeleton plan card + skeleton invoice table |
| **Free tier** (no subscription) | Current plan card shows "FREE PLAN" with `$0/month`. No invoice table. No Stripe management button. "UPGRADE TO PRO" accent button prominent |
| **Past due** | Status badge `[PAST DUE]` in amber. Banner: `[WARNING] Your payment failed. Please update your payment method. > UPDATE PAYMENT` |
| **Canceled** | Status badge `[CANCELED]` in red. Message: "Your subscription is canceled. You have access until {end date}. > RESUBSCRIBE" |
| **Downgrade confirmation** | Dialog: "DOWNGRADE TO FREE?" heading, warning list (will lose auto-sync, custom rules, scan history, limited to 1 repo), `> CANCEL` and `> DOWNGRADE` (destructive) buttons |

#### Actions

| Action | Behavior |
|--------|----------|
| Click `> MANAGE SUBSCRIPTION` | Redirect to Stripe Customer Portal URL |
| Click `> CHANGE PLAN` | Scroll to plan cards section |
| Click `> UPGRADE` (to Pro) | Redirect to Stripe Checkout with Pro price ID |
| Click `> UPGRADE` (to Team) | Redirect to Stripe Checkout with Team price ID |
| Click `> DOWNGRADE` | Confirmation dialog, then server action: cancel subscription at period end |
| Click `> VIEW` invoice | Open Stripe invoice URL in new tab |
| Click `> UPDATE PAYMENT` | Redirect to Stripe Customer Portal (payment method section) |

#### Mobile

- Plan cards stack vertically
- Invoices table: card-based layout (each invoice as a mini-card)
- Current plan card: full-width

---

## Shared Components

Components used across multiple dashboard pages. Build these first.

### DashboardLayout

```typescript
// src/app/(dashboard)/layout.tsx
// Wraps all /dashboard/** routes

interface DashboardLayoutProps {
  children: React.ReactNode
}

// - Auth check: redirect to /login if not authenticated
// - Sidebar (240px, collapsible on mobile)
// - Header with breadcrumbs
// - Main content area (flex-1, overflow-y-auto)
// - Background: bg-background
```

### Sidebar

```typescript
// src/components/dashboard/sidebar.tsx

interface SidebarProps {
  user: { name: string; email: string; image: string; plan: Plan }
  currentPath: string
}

// Navigation items:
// - OVERVIEW → /dashboard
// - REPOSITORIES → /dashboard/repos
// - Divider
// - SETTINGS → /dashboard/settings
// - BILLING → /dashboard/billing
// - Divider
// - User info + > SIGN OUT
//
// Active item: text-accent, border-l-2 border-accent, bg-muted
// Inactive item: text-muted-foreground, hover:text-foreground
```

### Breadcrumbs

```typescript
// src/components/dashboard/breadcrumbs.tsx

interface BreadcrumbsProps {
  segments: Array<{ label: string; href?: string }>
  plan: Plan
}

// Renders: DASHBOARD > REPOS > repo-name  [PRO]
// Each segment is UPPERCASE
// Separator: " > " in text-muted-foreground
// Last segment: text-foreground (current page, not a link)
// Plan badge: right-aligned
```

### RepoSubNav

```typescript
// src/components/dashboard/repo-sub-nav.tsx

interface RepoSubNavProps {
  repoId: string
  activeTab: 'intelligence' | 'files' | 'history'
}

// Horizontal tabs: INTELLIGENCE | FILES | HISTORY
// Active: border-b-2 border-accent text-accent
// Inactive: text-muted-foreground hover:text-foreground
```

### KPICard

```typescript
// src/components/dashboard/kpi-card.tsx
// (Or use @fabrk/components KPICard when available)

interface KPICardProps {
  title: string    // UPPERCASE label
  value: string | number
  subtitle?: string
  trend?: { direction: 'up' | 'down' | 'flat'; value: string }  // "+3 from last scan"
  loading?: boolean
}

// Skeleton state: pulsing bg-muted rectangles for value and title
```

### StatusBadge

```typescript
// src/components/shared/status-badge.tsx

interface StatusBadgeProps {
  status: 'completed' | 'scanning' | 'pending' | 'failed'
}

// [COMPLETED] — border-emerald-800 text-emerald-400 bg-emerald-950
// [SCANNING]  — border-amber-800 text-amber-400 bg-amber-950 + animate-pulse
// [PENDING]   — border-zinc-700 text-zinc-400 bg-zinc-900
// [FAILED]    — border-red-800 text-red-400 bg-red-950
```

### PlanBadge

```typescript
// src/components/shared/plan-badge.tsx

interface PlanBadgeProps {
  plan: 'FREE' | 'PRO' | 'TEAM'
}

// [FREE] — text-muted-foreground border-border
// [PRO]  — text-accent border-accent
// [TEAM] — text-accent border-accent
```

### EmptyState

```typescript
// src/components/shared/empty-state.tsx

interface EmptyStateProps {
  icon?: React.ReactNode     // Default: large # symbol
  heading: string            // UPPERCASE
  description: string        // Normal case, text-muted-foreground
  action?: {
    label: string            // UPPERCASE with > prefix
    href?: string
    onClick?: () => void
  }
}
```

### UpgradeGate

```typescript
// src/components/shared/upgrade-gate.tsx

interface UpgradeGateProps {
  feature: string            // "Scan History", "Custom Rules", etc.
  description: string
  plan: 'PRO' | 'TEAM'      // Required plan
  children?: React.ReactNode // Blurred preview content
}

// Shows feature name, description, upgrade button
// Optional: renders children with blur + overlay
```

---

## API Route Summary

These API routes support the dashboard pages.

| Method | Route | Purpose | Auth | Plan Gate |
|--------|-------|---------|------|-----------|
| GET | `/api/repos` | List user's connected repos | Yes | -- |
| POST | `/api/repos` | Connect a new repo | Yes | Free: 1 repo max |
| DELETE | `/api/repos/[repoId]` | Disconnect a repo | Yes | -- |
| GET | `/api/repos/[repoId]` | Get single repo with latest scan | Yes | -- |
| POST | `/api/scan` | Trigger a scan for a repo | Yes | -- |
| GET | `/api/scan/[scanId]` | Get scan status and results | Yes | -- |
| GET | `/api/repos/[repoId]/scans` | List scan history for a repo | Yes | Pro |
| GET | `/api/repos/[repoId]/files` | Get generated files for latest scan | Yes | -- |
| GET | `/api/repos/[repoId]/files/download` | Download all files as ZIP | Yes | -- |
| POST | `/api/repos/[repoId]/action` | Install GitHub Action | Yes | Pro |
| GET | `/api/github/repos` | List user's GitHub repos (for connect dialog) | Yes | -- |
| POST | `/api/stripe/checkout` | Create Stripe Checkout session | Yes | -- |
| POST | `/api/stripe/portal` | Create Stripe Customer Portal session | Yes | -- |
| POST | `/api/webhooks/stripe` | Stripe webhook handler | No (verified by sig) | -- |
| POST | `/api/webhooks/github` | GitHub push event handler | No (verified by sig) | -- |
| GET | `/api/user/rules` | List custom rules | Yes | Pro |
| POST | `/api/user/rules` | Create custom rule | Yes | Pro |
| PUT | `/api/user/rules/[ruleId]` | Update custom rule | Yes | Pro |
| DELETE | `/api/user/rules/[ruleId]` | Delete custom rule | Yes | Pro |

---

## Implementation Priority

Build pages in this order based on dependencies and user flow:

| Priority | Page | Depends On | Notes |
|----------|------|------------|-------|
| 1 | `/login` | NextAuth config (done) | Gate to everything |
| 2 | `/dashboard` (layout + page) | Auth middleware, sidebar, breadcrumbs | Shell for all dashboard pages |
| 3 | `/dashboard/repos` | GitHub API, repo CRUD | Core feature |
| 4 | `/dashboard/[repoId]` | Scan engine, scan API | Core value display |
| 5 | `/dashboard/[repoId]/files` | Generated file storage | Core value output |
| 6 | `/dashboard/billing` | Stripe integration | Monetization |
| 7 | `/dashboard/settings` | Custom rules CRUD | Pro feature |
| 8 | `/dashboard/[repoId]/history` | Multiple scans | Pro feature |
| 9 | `/pricing` | Stripe price IDs | SEO + marketing |

Shared components to build first (before any page): DashboardLayout, Sidebar, Breadcrumbs, KPICard, StatusBadge, PlanBadge, EmptyState, UpgradeGate.
