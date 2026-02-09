# Hashmark -- PostHog Analytics Plan

PostHog analytics plan for hashmark.md. Covers event tracking, dashboards, feature flags, and conversion funnels. All events use PostHog's JavaScript Web SDK (`posthog-js`) on the Next.js 16 frontend and the Node SDK (`posthog-node`) for server-side and GitHub Action telemetry.

---

## Setup

### Installation

```bash
pnpm add posthog-js posthog-node
```

### Client-side Provider (Next.js App Router)

```tsx
// src/lib/posthog.ts
import posthog from 'posthog-js'

export function initPostHog() {
  if (typeof window !== 'undefined') {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false, // manual pageview tracking via Next.js router
      capture_pageleave: true,
    })
  }
  return posthog
}
```

```tsx
// src/app/providers.tsx
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { initPostHog } from '@/lib/posthog'

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ph = usePostHog()

  useEffect(() => {
    if (pathname && ph) {
      let url = window.origin + pathname
      if (searchParams.toString()) {
        url = url + '?' + searchParams.toString()
      }
      ph.capture('page_viewed', {
        path: pathname,
        referrer: document.referrer || null,
        url,
      })
    }
  }, [pathname, searchParams, ph])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  )
}
```

### Server-side Client

```ts
// src/lib/posthog-server.ts
import { PostHog } from 'posthog-node'

let posthogServer: PostHog | null = null

export function getPostHogServer(): PostHog {
  if (!posthogServer) {
    posthogServer = new PostHog(process.env.POSTHOG_API_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return posthogServer
}
```

### User Identification

Identify users on login so all events tie to a single person profile:

```ts
// After NextAuth sign-in callback
posthog.identify(user.id, {
  email: user.email,
  name: user.name,
  github_username: user.githubUsername,
  plan: user.plan, // FREE | PRO | TEAM
  created_at: user.createdAt,
})
```

Update person properties when the plan changes:

```ts
posthog.people.set({ plan: 'PRO' })
```

---

## 1. Key Events

Every event name uses `snake_case`. Properties use `camelCase` keys.

### Acquisition Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `page_viewed` | Every client-side navigation | `{ path, referrer, url }` |
| `signup_completed` | After GitHub OAuth callback creates new user | `{ provider: "github" }` |
| `cli_upsell_clicked` | User clicks Hashmark link shown in CLI output or in-app CLI promo | `{ source: "cli_output" \| "scan_results" \| "format_limit" \| "dashboard_banner" }` |

### Repository Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `repo_connected` | User connects a GitHub repo | `{ repoId, isPrivate, stars, language, defaultBranch }` |
| `repo_disconnected` | User removes a connected repo | `{ repoId }` |

### Scanning Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `scan_started` | Scan job begins (web UI, CLI, or Action) | `{ repoId, source: "web" \| "cli" \| "action", format }` |
| `scan_completed` | Scan job finishes successfully | `{ repoId, duration, fileCount, componentCount, formatCount, scanId }` |
| `scan_failed` | Scan job errors out | `{ repoId, source, error, duration }` |

### Format Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `format_generated` | A single format file is generated from scan results | `{ repoId, format, tokenCount, scanId }` |
| `format_downloaded` | User downloads a generated file (single or ZIP) | `{ repoId, format, isZip }` |

### GitHub Action Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `action_installed` | User installs the Hashmark GitHub Action on a repo | `{ repoId }` |
| `action_removed` | User removes the Action workflow | `{ repoId }` |

### Rules Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `rule_created` | User creates a custom rule | `{ ruleId, scope: "repo" \| "org" }` |
| `rule_updated` | User edits an existing rule | `{ ruleId }` |
| `rule_deleted` | User deletes a rule | `{ ruleId, scope }` |

### Billing Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `checkout_started` | User clicks "Upgrade" and is redirected to Stripe Checkout | `{ plan: "pro" \| "team" }` |
| `subscription_created` | Stripe webhook `checkout.session.completed` fires for new sub | `{ plan, price, interval: "monthly" \| "yearly" }` |
| `subscription_cancelled` | Stripe webhook `customer.subscription.deleted` fires | `{ plan, reason }` |
| `subscription_reactivated` | User re-subscribes after cancellation | `{ plan, price, interval }` |

### Implementation Examples

**Client-side (React component):**

```tsx
import { usePostHog } from 'posthog-js/react'

function ConnectRepoButton({ repo }: { repo: GitHubRepo }) {
  const posthog = usePostHog()

  async function handleConnect() {
    await connectRepo(repo.id)
    posthog.capture('repo_connected', {
      repoId: repo.id,
      isPrivate: repo.private,
      stars: repo.stargazers_count,
      language: repo.language,
      defaultBranch: repo.default_branch,
    })
  }

  return <button onClick={handleConnect}>Connect</button>
}
```

**Server-side (API route):**

```ts
// src/app/api/scan/route.ts
import { getPostHogServer } from '@/lib/posthog-server'

export async function POST(req: Request) {
  const { repoId, source } = await req.json()
  const ph = getPostHogServer()

  ph.capture({
    distinctId: session.user.id,
    event: 'scan_started',
    properties: { repoId, source, format: 'all' },
  })

  const startTime = Date.now()

  try {
    const result = await runScan(repoId)
    const duration = Date.now() - startTime

    ph.capture({
      distinctId: session.user.id,
      event: 'scan_completed',
      properties: {
        repoId,
        duration,
        fileCount: result.fileCount,
        componentCount: result.componentCount,
        formatCount: result.formatsGenerated.length,
        scanId: result.scanId,
      },
    })

    // Track each format generated
    for (const format of result.formatsGenerated) {
      ph.capture({
        distinctId: session.user.id,
        event: 'format_generated',
        properties: {
          repoId,
          format: format.name,
          tokenCount: format.tokenCount,
          scanId: result.scanId,
        },
      })
    }

    await ph.flush()
    return Response.json(result)
  } catch (error) {
    ph.capture({
      distinctId: session.user.id,
      event: 'scan_failed',
      properties: {
        repoId,
        source,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      },
    })
    await ph.flush()
    throw error
  }
}
```

**Stripe webhook handler:**

```ts
// src/app/api/webhooks/stripe/route.ts
import { getPostHogServer } from '@/lib/posthog-server'

// Inside webhook handler switch:
case 'checkout.session.completed': {
  const session = event.data.object
  const ph = getPostHogServer()

  ph.capture({
    distinctId: session.metadata.userId,
    event: 'subscription_created',
    properties: {
      plan: session.metadata.plan,
      price: session.amount_total / 100,
      interval: session.metadata.interval,
    },
  })

  // Update person properties so plan is always current
  ph.capture({
    distinctId: session.metadata.userId,
    event: '$set',
    properties: { $set: { plan: session.metadata.plan } },
  })

  await ph.flush()
  break
}
```

---

## 2. Dashboards

### Dashboard 1: Acquisition

**Purpose:** Track the full funnel from external traffic to signed-up users.

| Tile | Type | Query |
|------|------|-------|
| Weekly unique visitors | Trend (line) | `page_viewed` unique users, grouped by week |
| Signups this week | Number | `signup_completed` count, last 7 days |
| Signups over time | Trend (line) | `signup_completed` count, grouped by week |
| CLI upsell clicks | Trend (bar) | `cli_upsell_clicked` count, grouped by week, broken down by `source` |
| Top landing pages | Table | `page_viewed` count, grouped by `path`, sorted desc |
| Referrer breakdown | Pie | `page_viewed` count where `referrer` is set, grouped by `referrer` domain |
| Signup conversion rate | Funnel | `page_viewed` (path = "/") -> `signup_completed` |

**PostHog Insight Definitions:**

```
-- Weekly signups trend
Event: signup_completed
Aggregation: Total count
Interval: Week
Date range: Last 90 days

-- CLI upsell effectiveness
Event: cli_upsell_clicked
Aggregation: Total count
Breakdown: source
Interval: Week
```

### Dashboard 2: Activation

**Purpose:** Measure the path from signup to habitual usage. A user is "activated" when they complete their first scan and download a format.

| Tile | Type | Query |
|------|------|-------|
| Activation funnel | Funnel | `signup_completed` -> `repo_connected` -> `scan_completed` -> `format_downloaded` -> `action_installed` |
| Time to first scan | Trend (line) | Median time from `signup_completed` to first `scan_completed` |
| Repos connected per user | Histogram | `repo_connected` unique `repoId` per user |
| First scan completion rate | Number | % of users with `signup_completed` who also have `scan_completed` (last 30 days) |
| Action install rate | Number | % of users with `scan_completed` who also have `action_installed` (last 30 days) |
| Formats generated breakdown | Bar | `format_generated` count, broken down by `format` |
| Drop-off points | Funnel | Full activation funnel with drop-off percentages at each step |

**PostHog Funnel Definition:**

```
-- Activation funnel (14-day conversion window)
Step 1: signup_completed
Step 2: repo_connected
Step 3: scan_completed
Step 4: format_downloaded
Step 5: action_installed
Conversion window: 14 days
```

### Dashboard 3: Revenue

**Purpose:** Track MRR, subscriptions, churn, and unit economics.

| Tile | Type | Query |
|------|------|-------|
| MRR (calculated) | Number | Sum of active subscriptions x price (use Group Analytics or HogQL) |
| New subscriptions this month | Number | `subscription_created` count, last 30 days |
| New subs over time | Trend (line) | `subscription_created` count, grouped by week |
| Cancellations this month | Number | `subscription_cancelled` count, last 30 days |
| Churn rate | Trend (line) | `subscription_cancelled` / total active subs, grouped by month |
| Plan distribution | Pie | `subscription_created` count, broken down by `plan` |
| ARPU | Number | Total revenue / unique paying users (HogQL) |
| Cancellation reasons | Table | `subscription_cancelled` count, broken down by `reason` |
| Checkout started -> Subscribed | Funnel | `checkout_started` -> `subscription_created` (7-day window) |
| Revenue by interval | Bar | `subscription_created` count, broken down by `interval` (monthly vs yearly) |

**HogQL for MRR:**

```sql
SELECT
  sum(
    CASE
      WHEN properties.plan = 'pro' THEN 19
      WHEN properties.plan = 'team' THEN 29
      ELSE 0
    END
  ) AS mrr
FROM events
WHERE event = 'subscription_created'
  AND timestamp > now() - INTERVAL 30 DAY
  AND distinct_id NOT IN (
    SELECT distinct_id FROM events
    WHERE event = 'subscription_cancelled'
      AND timestamp > now() - INTERVAL 30 DAY
  )
```

### Dashboard 4: Engagement

**Purpose:** Understand how actively users use the product after activation.

| Tile | Type | Query |
|------|------|-------|
| Scans per week | Trend (line) | `scan_completed` count, grouped by week |
| Scans per user (weekly) | Trend (line) | `scan_completed` count per unique user, grouped by week |
| Formats per scan | Trend (line) | Average `formatCount` from `scan_completed`, grouped by week |
| Action-triggered scans | Trend (bar) | `scan_completed` where `source = "action"`, grouped by week |
| Web vs CLI vs Action split | Stacked area | `scan_started` count, broken down by `source`, grouped by week |
| Most popular formats | Bar | `format_generated` count, broken down by `format` |
| Download rate | Number | `format_downloaded` count / `format_generated` count (last 30 days) |
| Rules created | Trend (line) | `rule_created` count, grouped by week |
| DAU / WAU ratio (stickiness) | Trend (line) | Daily active users / Weekly active users |
| Power users | Table | Users with most `scan_completed` events, last 30 days |

---

## 3. Feature Flags

Managed via PostHog Feature Flags. Use the `posthog-js` client to evaluate flags client-side and `posthog-node` for server-side checks.

### Flag Definitions

| Flag Key | Type | Description | Rollout Strategy |
|----------|------|-------------|-----------------|
| `team-features` | Boolean | Gates Team tier features: org-wide rules, team dashboard, invite members | 100% of users where `plan = "team"`. For beta testing, start at 10% of team users. |
| `custom-rules` | Boolean | Gates custom rule creation and management | 100% of Pro and Team users. 0% of Free. |
| `pr-mode` | Boolean | Enables `mode: pr` in GitHub Action (creates PR instead of direct commit) | 50% rollout initially to gather feedback, then 100%. |
| `new-format-adapters` | Boolean | Gates new output formats as they are added (e.g., `.clinerules`, future formats) | 20% rollout to Pro+ users for testing, then ramp to 100%. |

### Implementation

**Client-side flag check:**

```tsx
import { useFeatureFlagEnabled } from 'posthog-js/react'

function CustomRulesSection() {
  const customRulesEnabled = useFeatureFlagEnabled('custom-rules')

  if (!customRulesEnabled) {
    return <UpgradePrompt feature="Custom Rules" plan="pro" />
  }

  return <CustomRulesEditor />
}
```

**Server-side flag check:**

```ts
import { getPostHogServer } from '@/lib/posthog-server'

async function checkFlag(userId: string, flag: string): Promise<boolean> {
  const ph = getPostHogServer()
  const enabled = await ph.isFeatureEnabled(flag, userId)
  return enabled ?? false
}

// In API route or Server Component:
const canUsePrMode = await checkFlag(user.id, 'pr-mode')
```

**Flag-based plan gating middleware:**

```ts
// src/lib/feature-gate.ts
import { getPostHogServer } from '@/lib/posthog-server'

type Feature = 'custom-rules' | 'team-features' | 'pr-mode' | 'new-format-adapters'

export async function isFeatureEnabled(
  userId: string,
  feature: Feature
): Promise<boolean> {
  const ph = getPostHogServer()
  return (await ph.isFeatureEnabled(feature, userId)) ?? false
}

export async function requireFeature(userId: string, feature: Feature) {
  const enabled = await isFeatureEnabled(userId, feature)
  if (!enabled) {
    throw new Error(`Feature "${feature}" is not available on your plan.`)
  }
}
```

### Experiments (A/B Tests)

Use PostHog Experiments (built on feature flags) for:

| Experiment | Hypothesis | Variants | Success Metric |
|-----------|-----------|----------|----------------|
| `pricing-page-layout` | Showing scan count social proof increases Pro conversion | Control (current) vs Variant (with "X repos scanned" counter) | `checkout_started` rate |
| `cli-upsell-copy` | Different upsell messages in CLI output convert differently | "Want all formats?" vs "Your AI tools are missing context" vs "Unlock auto-sync" | `cli_upsell_clicked` rate |
| `onboarding-flow` | Guided onboarding increases activation | Control (dashboard) vs Variant (step-by-step wizard) | `scan_completed` within 24h of signup |

---

## 4. Conversion Funnels

### Funnel A: Full Journey (CLI to Paid)

Tracks the complete acquisition path from CLI usage through to paid conversion.

```
Step 1: cli_upsell_clicked       -- User sees value in CLI, clicks Hashmark link
Step 2: page_viewed (path="/")   -- Lands on hashmark.md
Step 3: signup_completed         -- Creates account via GitHub OAuth
Step 4: repo_connected           -- Connects first repo
Step 5: scan_completed           -- Runs first scan
Step 6: format_downloaded        -- Downloads generated files
Step 7: checkout_started         -- Clicks upgrade
Step 8: subscription_created     -- Becomes paying customer
```

**PostHog Configuration:**
- Conversion window: 30 days
- Breakdown by: `source` (to compare CLI vs organic vs blog referrers)
- Exclusions: Internal team user IDs

### Funnel B: Activation (Signup to Habitual Use)

Tracks the core activation loop -- the path from new user to auto-synced repo.

```
Step 1: signup_completed         -- New user
Step 2: repo_connected           -- Connects a GitHub repo
Step 3: scan_completed           -- First scan runs
Step 4: format_downloaded        -- Downloads at least one format
Step 5: action_installed         -- Installs GitHub Action (auto-sync)
```

**PostHog Configuration:**
- Conversion window: 14 days
- Breakdown by: `plan` (to see if paid users activate faster)

### Funnel C: Upgrade Path

Tracks the monetization conversion from engaged free users to paying customers.

```
Step 1: scan_completed (3+ times)  -- Repeated usage signals value
Step 2: page_viewed (path="/pricing") -- Views pricing page
Step 3: checkout_started           -- Initiates checkout
Step 4: subscription_created       -- Payment succeeds
```

**PostHog Configuration:**
- Conversion window: 30 days
- Breakdown by: `plan` (pro vs team)

### Funnel D: Team Expansion

Tracks how individual Pro users bring their teams.

```
Step 1: subscription_created (plan="pro")  -- Solo paid user
Step 2: repo_connected (3+ repos)          -- Multi-repo usage
Step 3: rule_created (scope="org")         -- Creates org-level rule
Step 4: checkout_started (plan="team")     -- Initiates team upgrade
Step 5: subscription_created (plan="team") -- Team subscription created
```

**PostHog Configuration:**
- Conversion window: 90 days

---

## 5. Cohort Definitions

Define reusable cohorts for filtering across dashboards and funnels.

| Cohort | Definition | Use Case |
|--------|-----------|----------|
| `activated_users` | Users with at least one `scan_completed` event | Activation rate denominator |
| `power_users` | Users with 5+ `scan_completed` events in last 30 days | Engagement analysis, upsell targeting |
| `free_at_risk` | Free users with no `scan_completed` in last 14 days | Re-engagement emails |
| `upgrade_candidates` | Free users with 3+ scans and 2+ repos connected | Targeted upgrade prompts |
| `churned_paid` | Users with `subscription_cancelled` in last 30 days | Win-back campaigns |
| `action_users` | Users with `action_installed` and `scan_completed` where `source = "action"` | Stickiest users, testimonial candidates |

---

## 6. Group Analytics

Use PostHog Group Analytics to track organizations (Team tier).

```ts
// When a team is created or user joins an org
posthog.group('organization', orgId, {
  name: orgName,
  plan: 'team',
  seat_count: seatCount,
  created_at: org.createdAt,
})
```

This enables per-organization dashboards:
- Scans per org
- Formats generated per org
- Active seats per org
- Org-level churn analysis

---

## 7. Session Replay Configuration

Enable PostHog Session Replay for debugging and UX research, scoped to key flows.

```ts
posthog.init(key, {
  session_recording: {
    // Only record sessions where the user interacts with key features
    maskAllInputs: true,
    maskTextSelector: '[data-ph-mask]', // mask sensitive content
  },
})
```

**Record sessions for:**
- Users who start checkout but do not complete (`checkout_started` without `subscription_created`)
- Users who connect a repo but never scan (`repo_connected` without `scan_completed`)
- Users who encounter `scan_failed`

Use PostHog's conditional recording:
```ts
// Start recording only for specific flows
if (isCheckoutPage || isScanPage) {
  posthog.startSessionRecording()
}
```

---

## 8. Alerts

Set up PostHog Actions and webhook alerts for operational monitoring.

| Alert | Condition | Channel |
|-------|----------|---------|
| Scan failure spike | `scan_failed` count > 5 in 1 hour | Slack `#alerts` |
| Zero signups | `signup_completed` count = 0 for 24 hours | Slack `#growth` |
| Churn spike | `subscription_cancelled` count > 3 in 1 day | Slack `#revenue` |
| Checkout drop-off | `checkout_started` without `subscription_created` within 1 hour, > 5 occurrences | Slack `#revenue` |

---

## 9. Environment Variables

```env
# .env.local
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=phx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # server-side, private
```

`NEXT_PUBLIC_POSTHOG_KEY` is the project API key (safe to expose client-side).
`POSTHOG_API_KEY` is a personal API key for server-side capture and feature flag evaluation. Never expose this in client bundles.

---

## 10. Event Naming Conventions

- **Events**: `snake_case` -- `scan_completed`, `repo_connected`
- **Properties**: `camelCase` -- `repoId`, `fileCount`, `tokenCount`
- **Feature flags**: `kebab-case` -- `team-features`, `pr-mode`
- **Cohorts**: `snake_case` -- `power_users`, `free_at_risk`
- **Groups**: `snake_case` -- `organization`

All event names are past tense (`completed`, `created`, `clicked`) to indicate something that happened, not something in progress.
