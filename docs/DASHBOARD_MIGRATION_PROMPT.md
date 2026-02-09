# Hashmark Dashboard — FABRK Migration + Completion Prompt

> Give this to a fresh Claude Code instance working on the hashmark repo (feat/dashboard branch).

---

## Context

You're working on **Hashmark** (hashmark.md) — a SaaS that scans codebases and generates AI context files for 8 coding tools.

The dashboard is **already built** with 18 routes, auth, middleware, and 14 custom components. BUT it's all custom Tailwind — `@fabrk/components`, `@fabrk/core`, and `@fabrk/design-system` are installed as local file deps but **not imported anywhere**.

Your job: **migrate to FABRK components** where they're better than custom, wire up the scan engine, and wire up Stripe.

Read `CLAUDE.md` first — it has the full design rules, FABRK integration table, and available components. Then read `docs/UX_SPEC.md` for page specs.

---

## Step 1: Migrate Dashboard Layout to DashboardShell

**Current**: Custom `Sidebar` + `DashboardHeader` in `src/components/dashboard/`.
**Target**: `DashboardShell` from `@fabrk/components`.

Replace `src/app/(dashboard)/layout.tsx`:

```tsx
import { DashboardShell } from '@fabrk/components'
import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, GitBranch, Settings, CreditCard } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sidebarItems = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="size-4" />, href: '/dashboard' },
    { id: 'repos', label: 'Repositories', icon: <GitBranch className="size-4" />, href: '/dashboard/repos' },
    { id: 'settings', label: 'Settings', icon: <Settings className="size-4" />, href: '/dashboard/settings' },
    { id: 'billing', label: 'Billing', icon: <CreditCard className="size-4" />, href: '/dashboard/billing' },
  ]

  return (
    <DashboardShell
      sidebarItems={sidebarItems}
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        tier: 'free', // TODO: fetch from DB
      }}
      logo={<span className="text-accent text-xl font-bold">#</span>}
      title="HASHMARK"
      onSignOut={async () => { 'use server'; await signOut() }}
      linkComponent={Link}
    >
      {children}
    </DashboardShell>
  )
}
```

Then delete the custom Sidebar and DashboardHeader from `src/components/dashboard/` if they're no longer imported.

## Step 2: Migrate Page Headers

**Replace custom headers** in dashboard pages with FABRK components:

- `DashboardHeader` from `@fabrk/components` — for simple page titles with actions
- `PageHeader` from `@fabrk/components` — for pages with tabs/search (repos list, intelligence)
- `StatsGrid` from `@fabrk/components` — for the KPI row on overview and intelligence pages
- `TierBadge` from `@fabrk/components` — replaces custom `PlanBadge` in breadcrumbs

Also use FABRK's existing components where they match:
- `Badge` for status indicators (replaces custom StatusBadge)
- `Button` for all buttons
- `Card` for card layouts
- `Input` for form inputs
- `EmptyState` for empty pages
- `KpiCard` for individual stat cards with trends
- `DataTable` for the repos list table (if needed)

**Keep custom** components that are Hashmark-specific:
- `ConnectRepoDialog` — GitHub repo picker
- `IntelligencePage` — scan results visualization
- `FilesPage` — generated file viewer
- `LoginCard` / `OAuthButtons` — auth UI

## Step 3: Wire Up Scan Engine

The `runScanInBackground()` in `src/app/(dashboard)/dashboard/repos/actions.ts` is a placeholder (3-second fake delay). Wire it to the actual CLI scanner.

The CLI is at `packages/cli/` — it exports `scanComponents`, `generateAgentsMd`, `generateFormat`, `generateAllFormats` from its source. But since it's built as a CLI binary, the simplest approach:

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

async function runScanInBackground(repoId: string, cloneUrl: string) {
  // 1. Clone repo to temp dir
  const tmpDir = `/tmp/hashmark-scan-${repoId}`
  await execAsync(`git clone --depth 1 ${cloneUrl} ${tmpDir}`)

  // 2. Run hashmark CLI
  const { stdout } = await execAsync(
    `node ${process.cwd()}/packages/cli/dist/cli.js ${tmpDir} --format all --json --force`,
    { maxBuffer: 10 * 1024 * 1024 }
  )

  // 3. Parse results, save to DB (Scan + GeneratedFile records)
  // 4. Clean up tmp dir
  await execAsync(`rm -rf ${tmpDir}`)
}
```

Update the scan status in DB: QUEUED → SCANNING → COMPLETED/FAILED.

Store generated files in the `GeneratedFile` table with format, content, and token count.

## Step 4: Wire Up Stripe Billing

`src/app/(dashboard)/dashboard/billing/page.tsx` is a static placeholder. Wire it up:

1. **API routes exist** at `src/app/api/billing/` — verify checkout, portal, and webhook routes work
2. **Create Stripe products/prices** for FREE, PRO ($19/mo), TEAM ($49/mo)
3. **Checkout flow**: Button → `/api/billing/checkout` → Stripe Checkout → webhook updates user.plan
4. **Portal**: Button → `/api/billing/portal` → Stripe Customer Portal for plan management
5. **Webhook handler**: `src/app/api/billing/webhook/route.ts` — handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
6. **Plan gating**: Check `user.plan` before allowing Pro features (custom rules, scan history)

Use the Stripe client at `src/lib/stripe.ts`.

## Step 5: Polish

- Verify all design tokens match CLAUDE.md rules (no hardcoded colors, monospace everywhere, UPPERCASE headings/buttons)
- Terminal aesthetic: `#` brand motif, `> BUTTON_TEXT` prefix, `[LABEL]` badges
- Mobile responsive: DashboardShell handles this, verify page content flows
- Loading states: Use Skeleton/Shimmer patterns during data fetches
- Error states: Use FABRK's `FormError` or custom error cards

## Design Token Reference

All FABRK components use these CSS variables (already configured in globals.css):

```
--background: #09090b    --foreground: #fafafa
--card/--muted: #18181b  --muted-foreground: #a1a1aa
--border: #27272a        --accent: #10b981
--destructive: #ef4444   --warning: #f59e0b
--success: #10b981       --info: #3b82f6
--radius: 0rem           --font-body: monospace
```

Import pattern:
```tsx
import { DashboardShell, DashboardHeader, PageHeader, StatsGrid, TierBadge, Button, Badge, Card, Input, KpiCard, EmptyState } from '@fabrk/components'
import { mode } from '@fabrk/design-system'
import { cn } from '@fabrk/core'
```

## FABRK Package Locations (local file deps)

```json
"@fabrk/components": "file:../fabrk-framework/packages/components",
"@fabrk/core": "file:../fabrk-framework/packages/core",
"@fabrk/design-system": "file:../fabrk-framework/packages/design-system"
```

## What NOT to Do

- Don't rebuild components that FABRK already has
- Don't use `bg-zinc-950` — use `bg-background`
- Don't use `text-emerald-500` — use `text-accent`
- Don't add rounded corners — radius is 0 (terminal aesthetic)
- Don't use sans-serif fonts anywhere
- Don't add features beyond what's specified (no notifications, no team management yet)
