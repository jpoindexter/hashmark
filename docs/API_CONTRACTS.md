# Hashmark API Contracts

Complete API endpoint documentation for the Hashmark web application. All routes live under `src/app/api/` using Next.js 16 App Router conventions.

**Base URL:** `https://hashmark.md` (production) | `http://localhost:3000` (dev)

**Auth:** All authenticated endpoints require a valid NextAuth session. The user's GitHub OAuth access token (stored in the `Account` table) is used for GitHub API calls.

**Content-Type:** All request/response bodies are `application/json` unless noted otherwise.

---

## Table of Contents

1. [Auth](#1-auth)
2. [Repos](#2-repos)
3. [Scan](#3-scan)
4. [Files](#4-files)
5. [Action](#5-action)
6. [Rules](#6-rules)
7. [Webhooks](#7-webhooks)
8. [Billing](#8-billing)
9. [Shared Types](#9-shared-types)
10. [Error Handling](#10-error-handling)

---

## 9. Shared Types

These types are referenced throughout the endpoint definitions.

```typescript
// Enums (from Prisma schema)
type Plan = "FREE" | "PRO" | "TEAM";
type ScanStatus = "PENDING" | "SCANNING" | "COMPLETED" | "FAILED";
type FileFormat =
  | "AGENTS_MD"
  | "CLAUDE_MD"
  | "CURSORRULES"
  | "CURSOR_MDC"
  | "COPILOT_INSTRUCTIONS"
  | "WINDSURFRULES"
  | "GEMINI_MD";
type RuleScope = "REPO" | "ORG";

// Common response envelope
interface ApiError {
  error: string;
  code?: string;
}

// Session user (from NextAuth)
interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

// Repository (DB record)
interface Repository {
  id: string;
  userId: string;
  githubRepoId: number;
  name: string;
  fullName: string; // "owner/repo"
  defaultBranch: string;
  private: boolean;
  language: string | null;
  description: string | null;
  actionInstalled: boolean;
  lastScanAt: string | null; // ISO 8601
  createdAt: string;
  updatedAt: string;
}

// Scan (DB record)
interface Scan {
  id: string;
  repositoryId: string;
  status: ScanStatus;
  results: ScanResults | null;
  fileCount: number | null;
  lineCount: number | null;
  componentCount: number | null;
  apiRouteCount: number | null;
  modelCount: number | null;
  tokenEstimate: number | null;
  error: string | null;
  duration: number | null; // milliseconds
  commitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

// Scan results JSON (output of hashmark-cli --json)
interface ScanResults {
  framework: string;
  language: string;
  components: ComponentInfo[];
  apiRoutes: ApiRouteInfo[];
  models: ModelInfo[];
  hooks: string[];
  patterns: PatternInfo[];
  envVars: EnvVarInfo[];
  stats: {
    files: number;
    lines: number;
    components: number;
    apiRoutes: number;
    models: number;
  };
  [key: string]: unknown; // Additional scanner output
}

interface ComponentInfo {
  name: string;
  path: string;
  props: string[];
  variants?: string[];
}

interface ApiRouteInfo {
  path: string;
  methods: string[];
  auth: boolean;
}

interface ModelInfo {
  name: string;
  fields: { name: string; type: string }[];
  relations: string[];
}

interface PatternInfo {
  name: string;
  description: string;
  examples: string[];
}

interface EnvVarInfo {
  name: string;
  required: boolean;
  description?: string;
}

// Generated file (DB record)
interface GeneratedFile {
  id: string;
  scanId: string;
  format: FileFormat;
  fileName: string;
  content: string;
  tokenCount: number | null;
  createdAt: string;
}

// Custom rule (DB record)
interface CustomRule {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  rule: string;
  scope: RuleScope;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// GitHub repo (from Octokit, simplified)
interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  language: string | null;
  description: string | null;
  html_url: string;
  updated_at: string;
  stargazers_count: number;
}
```

---

## 1. Auth

### `POST /api/auth/[...nextauth]`

NextAuth v5 catch-all handler. Handles all OAuth flows, session management, and callbacks.

**File:** `src/app/api/auth/[...nextauth]/route.ts`

```typescript
// route.ts — already implemented
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

**Handled sub-routes:**

| Path | Method | Purpose |
|------|--------|---------|
| `/api/auth/signin` | GET | Redirects to GitHub OAuth |
| `/api/auth/signin/github` | POST | Initiates GitHub OAuth flow |
| `/api/auth/callback/github` | GET | GitHub OAuth callback |
| `/api/auth/signout` | POST | Destroys session |
| `/api/auth/session` | GET | Returns current session |
| `/api/auth/csrf` | GET | Returns CSRF token |

**OAuth scopes requested:** `read:user user:email repo read:org`

**Session callback** enriches the session with the user's database ID:

```typescript
callbacks: {
  async session({ session, user }) {
    if (session.user) {
      session.user.id = user.id;
    }
    return session;
  },
}
```

**Notes:**
- Custom sign-in page at `/login`
- PrismaAdapter creates User, Account, and Session records automatically
- The `Account.access_token` stores the GitHub OAuth token needed for Octokit calls

---

## 2. Repos

### `GET /api/repos`

List the authenticated user's GitHub repositories via Octokit. Merges GitHub data with any connected repositories from the database.

**File:** `src/app/api/repos/route.ts`

**Auth:** Required (session)

**Request:** None (query params optional)

```typescript
// Optional query params
interface ReposQuery {
  connected?: "true" | "false"; // Filter to connected/unconnected only
}
```

**Response: `200 OK`**

```typescript
interface ReposResponse {
  repos: Array<
    GitHubRepo & {
      connected: boolean;
      repositoryId: string | null; // Hashmark DB ID if connected
      lastScanAt: string | null;
      actionInstalled: boolean;
    }
  >;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 500 | `{ error: "Failed to fetch repos" }` | GitHub API error |

**Implementation notes:**
- Uses `getUserRepos(accessToken)` from `src/lib/github.ts` (fetches up to 100 repos sorted by `updated`)
- Cross-references with `Repository` table to mark which are connected
- Requires the user's GitHub access token from the Account table

---

### `POST /api/repos/connect`

Connect a GitHub repository to Hashmark. Creates a `Repository` record in the database.

**File:** `src/app/api/repos/connect/route.ts`

**Auth:** Required (session)

**Request body:**

```typescript
interface ConnectRepoRequest {
  githubRepoId: number;
  name: string;
  fullName: string; // "owner/repo"
  defaultBranch: string;
  private: boolean;
  language: string | null;
  description: string | null;
}
```

**Response: `201 Created`**

```typescript
interface ConnectRepoResponse {
  repository: Repository;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "Missing required fields" }` | Body validation fails |
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 403 | `{ error: "Repo limit reached", code: "PLAN_LIMIT" }` | Free tier with 1 repo already connected |
| 409 | `{ error: "Repository already connected" }` | `githubRepoId` already exists in DB |
| 500 | `{ error: "Failed to connect repository" }` | Database error |

**Implementation notes:**
- Free tier allows 1 connected repo. Pro/Team allow unlimited.
- Validates that the user has access to the repo via GitHub API before connecting
- Optionally triggers an initial scan after connecting (controlled by query param `?scan=true`)

---

### `DELETE /api/repos/[repoId]`

Disconnect a repository from Hashmark. Deletes the `Repository` record and all associated scans and generated files (cascade).

**File:** `src/app/api/repos/[repoId]/route.ts`

**Auth:** Required (session, must own the repository)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `repoId` | string (cuid) | Hashmark repository ID |

**Response: `200 OK`**

```typescript
interface DeleteRepoResponse {
  success: true;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |
| 500 | `{ error: "Failed to disconnect repository" }` | Database error |

**Implementation notes:**
- Does NOT uninstall the GitHub Action from the repo (user must remove the workflow file manually or via the `/api/action/install` endpoint in reverse)
- Cascade deletes all `Scan` and `GeneratedFile` records

---

## 3. Scan

### `POST /api/scan/[repoId]`

Trigger a manual scan of a connected repository. Clones the repo, runs the hashmark scanner engine, generates all file formats, and stores results.

**File:** `src/app/api/scan/[repoId]/route.ts`

**Auth:** Required (session, must own the repository)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `repoId` | string (cuid) | Hashmark repository ID |

**Request body:**

```typescript
interface TriggerScanRequest {
  formats?: FileFormat[]; // Defaults to all formats
  compact?: boolean; // Compact output mode
}
```

**Response: `202 Accepted`**

```typescript
interface TriggerScanResponse {
  scan: {
    id: string;
    status: "PENDING";
    repositoryId: string;
    createdAt: string;
  };
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |
| 409 | `{ error: "Scan already in progress" }` | A PENDING or SCANNING scan already exists |
| 429 | `{ error: "Rate limit exceeded", code: "RATE_LIMIT" }` | Too many scans (100/hour) |
| 500 | `{ error: "Failed to start scan" }` | Clone or scanner failure |

**Implementation notes:**
- Returns `202` immediately with the pending scan record. The scan runs in the background.
- Background process:
  1. Update scan status to `SCANNING`
  2. Shallow clone the repo to a temp directory using the user's GitHub access token
  3. Run `hashmark-cli` (the scanner engine from `packages/cli/`) with `--json --force`
  4. Parse JSON output into `ScanResults`
  5. Create `GeneratedFile` records for each format
  6. Update scan with stats (`fileCount`, `lineCount`, `componentCount`, etc.)
  7. Set status to `COMPLETED` (or `FAILED` with error message)
  8. Update `Repository.lastScanAt`
  9. Clean up temp directory
- The client should poll `GET /api/scan/[repoId]/latest` to check progress
- Free tier: Manual scans only. Pro/Team: Also have auto-sync via GitHub Action.

---

### `GET /api/scan/[repoId]/latest`

Get the most recent scan for a repository, including generated files.

**File:** `src/app/api/scan/[repoId]/latest/route.ts`

**Auth:** Required (session, must own the repository)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `repoId` | string (cuid) | Hashmark repository ID |

**Response: `200 OK`**

```typescript
interface LatestScanResponse {
  scan: Scan & {
    generatedFiles: Array<{
      id: string;
      format: FileFormat;
      fileName: string;
      tokenCount: number | null;
      createdAt: string;
      // Note: content is NOT included here (use /api/files/[repoId]/[format])
    }>;
  };
}
```

**Response: `200 OK` (no scans)**

```typescript
interface NoScanResponse {
  scan: null;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |

**Implementation notes:**
- Returns the most recent scan ordered by `createdAt DESC`
- Does not include file content in the response (files can be large). Use the `/api/files` endpoint for content.
- Useful for polling: check `scan.status` to see if a scan is still running

---

### `GET /api/scan/[repoId]/history`

Get scan history for a repository, paginated.

**File:** `src/app/api/scan/[repoId]/history/route.ts`

**Auth:** Required (session, must own the repository)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `repoId` | string (cuid) | Hashmark repository ID |

**Query params:**

```typescript
interface ScanHistoryQuery {
  page?: number; // Default: 1
  limit?: number; // Default: 20, max: 100
}
```

**Response: `200 OK`**

```typescript
interface ScanHistoryResponse {
  scans: Array<
    Omit<Scan, "results"> & {
      formatsGenerated: FileFormat[];
    }
  >;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 403 | `{ error: "Upgrade required", code: "PLAN_LIMIT" }` | Free tier (scan history is Pro+) |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |

**Implementation notes:**
- Scan history is a Pro/Team feature. Free tier returns `403`.
- Results are ordered by `createdAt DESC`
- The `results` JSON field is omitted to keep the response light. Use `/api/scan/[repoId]/latest` for full results.
- Scan history retained for 90 days (Pro) or 30 days (Free, if this endpoint is ever opened to Free)

---

## 4. Files

### `GET /api/files/[repoId]/[format]`

Get the content of a specific generated file from the latest completed scan.

**File:** `src/app/api/files/[repoId]/[format]/route.ts`

**Auth:** Required (session, must own the repository)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `repoId` | string (cuid) | Hashmark repository ID |
| `format` | FileFormat | One of: `AGENTS_MD`, `CLAUDE_MD`, `CURSORRULES`, `CURSOR_MDC`, `COPILOT_INSTRUCTIONS`, `WINDSURFRULES`, `GEMINI_MD` |

**Response: `200 OK`**

```typescript
interface FileContentResponse {
  file: {
    id: string;
    format: FileFormat;
    fileName: string;
    content: string;
    tokenCount: number | null;
    createdAt: string;
    scanId: string;
  };
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "Invalid format" }` | Format param not in FileFormat enum |
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |
| 404 | `{ error: "No completed scan found" }` | No scan with status COMPLETED |
| 404 | `{ error: "File not found for format" }` | Format not generated in latest scan |

---

### `POST /api/files/[repoId]/download`

Download all generated files from the latest completed scan as a zip archive.

**File:** `src/app/api/files/[repoId]/download/route.ts`

**Auth:** Required (session, must own the repository)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `repoId` | string (cuid) | Hashmark repository ID |

**Request body:**

```typescript
interface DownloadFilesRequest {
  formats?: FileFormat[]; // Specific formats only. Default: all available
}
```

**Response: `200 OK`**

```
Content-Type: application/zip
Content-Disposition: attachment; filename="hashmark-{repoName}-{timestamp}.zip"
```

The zip contains files in their correct output paths:

```
hashmark-my-repo-2026-02-09/
  AGENTS.md
  CLAUDE.md
  .cursorrules
  .cursor/rules/project.mdc
  .github/copilot-instructions.md
  .windsurfrules
  GEMINI.md
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |
| 404 | `{ error: "No completed scan found" }` | No scan with status COMPLETED |

---

## 5. Action

### `POST /api/action/install`

Install the Hashmark GitHub Action workflow file into a user's repository via the GitHub Contents API.

**File:** `src/app/api/action/install/route.ts`

**Auth:** Required (session, must own the repository, Pro or Team plan)

**Request body:**

```typescript
interface InstallActionRequest {
  repoId: string;
  commitMode?: "auto" | "pr"; // Default: "auto"
  formats?: string; // Comma-separated. Default: "all"
}
```

**Response: `201 Created`**

```typescript
interface InstallActionResponse {
  success: true;
  commitSha: string;
  workflowPath: string; // ".github/workflows/hashmark.yml"
  htmlUrl: string; // GitHub URL to the committed file
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 403 | `{ error: "Upgrade required", code: "PLAN_LIMIT" }` | Free tier (Action is Pro+) |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |
| 409 | `{ error: "Action already installed" }` | Repository.actionInstalled is true |
| 422 | `{ error: "Failed to create workflow file" }` | GitHub API rejected the file creation |

**Implementation notes:**
- Uses `createOrUpdateFile()` from `src/lib/github.ts` to commit `.github/workflows/hashmark.yml`
- The workflow file triggers on push to `main`/`master` with `paths-ignore` for context files (prevents infinite loops)
- Sets `Repository.actionInstalled = true` on success
- If the file already exists, updates it (using the existing file's SHA for the update)

---

### `GET /api/action/status/[repoId]`

Check whether the GitHub Action is installed in a repository and its recent run status.

**File:** `src/app/api/action/status/[repoId]/route.ts`

**Auth:** Required (session, must own the repository)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `repoId` | string (cuid) | Hashmark repository ID |

**Response: `200 OK`**

```typescript
interface ActionStatusResponse {
  installed: boolean;
  workflowFileExists: boolean; // Verified via GitHub API
  lastRun: {
    id: number;
    status: "completed" | "in_progress" | "queued" | "failure";
    conclusion: "success" | "failure" | "cancelled" | null;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
  } | null;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 404 | `{ error: "Repository not found" }` | ID doesn't exist or not owned by user |

**Implementation notes:**
- Checks `Repository.actionInstalled` from the database
- Also verifies the workflow file exists in the repo via GitHub Contents API (in case the user deleted it manually)
- Fetches the latest workflow run via `octokit.actions.listWorkflowRuns` if installed

---

## 6. Rules

### `POST /api/rules`

Create a custom rule that gets injected into generated context files.

**File:** `src/app/api/rules/route.ts`

**Auth:** Required (session, Pro or Team plan)

**Request body:**

```typescript
interface CreateRuleRequest {
  name: string; // e.g., "Use design tokens"
  description?: string; // Optional explanation
  rule: string; // The rule content, e.g., "Always use semantic color tokens..."
  scope?: RuleScope; // Default: "REPO". "ORG" requires Team plan.
}
```

**Response: `201 Created`**

```typescript
interface CreateRuleResponse {
  rule: CustomRule;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "Name and rule are required" }` | Missing required fields |
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 403 | `{ error: "Upgrade required", code: "PLAN_LIMIT" }` | Free tier (custom rules are Pro+) |
| 403 | `{ error: "Team plan required for org rules", code: "PLAN_LIMIT" }` | ORG scope with Pro plan |

---

### `PUT /api/rules/[ruleId]`

Update an existing custom rule.

**File:** `src/app/api/rules/[ruleId]/route.ts`

**Auth:** Required (session, must own the rule)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `ruleId` | string (cuid) | Custom rule ID |

**Request body:**

```typescript
interface UpdateRuleRequest {
  name?: string;
  description?: string;
  rule?: string;
  scope?: RuleScope;
  enabled?: boolean;
}
```

**Response: `200 OK`**

```typescript
interface UpdateRuleResponse {
  rule: CustomRule;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "No fields to update" }` | Empty body |
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 403 | `{ error: "Team plan required for org rules", code: "PLAN_LIMIT" }` | Changing scope to ORG without Team plan |
| 404 | `{ error: "Rule not found" }` | ID doesn't exist or not owned by user |

---

### `DELETE /api/rules/[ruleId]`

Delete a custom rule.

**File:** `src/app/api/rules/[ruleId]/route.ts`

**Auth:** Required (session, must own the rule)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `ruleId` | string (cuid) | Custom rule ID |

**Response: `200 OK`**

```typescript
interface DeleteRuleResponse {
  success: true;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 404 | `{ error: "Rule not found" }` | ID doesn't exist or not owned by user |

---

## 7. Webhooks

### `POST /api/webhooks/github`

Receives GitHub webhook events. Currently handles `push` events to trigger auto-scans for connected repos.

**File:** `src/app/api/webhooks/github/route.ts`

**Auth:** GitHub webhook signature verification (`X-Hub-Signature-256` header, HMAC SHA-256 with `GITHUB_WEBHOOK_SECRET`)

**Headers:**

| Header | Value |
|--------|-------|
| `X-GitHub-Event` | Event type (e.g., `push`) |
| `X-Hub-Signature-256` | HMAC signature for body verification |
| `X-GitHub-Delivery` | Unique delivery ID |

**Request body (push event):**

```typescript
interface GitHubPushWebhook {
  ref: string; // "refs/heads/main"
  after: string; // Commit SHA
  repository: {
    id: number; // GitHub repo ID
    full_name: string;
    default_branch: string;
  };
  sender: {
    login: string;
  };
  head_commit: {
    id: string;
    message: string;
    author: { name: string; email: string };
  } | null;
}
```

**Response: `200 OK`**

```typescript
interface WebhookResponse {
  received: true;
  action?: "scan_triggered" | "ignored";
  reason?: string; // e.g., "repo not connected", "push to non-default branch"
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "Missing signature" }` | No `X-Hub-Signature-256` header |
| 401 | `{ error: "Invalid signature" }` | HMAC verification failed |
| 400 | `{ error: "Unsupported event" }` | Event type not `push` |

**Implementation notes:**
- Verifies the webhook signature using `GITHUB_WEBHOOK_SECRET` env var
- Only processes `push` events to the repo's default branch
- Ignores pushes from `hashmark[bot]` (prevents scan loops from auto-committed context files)
- Looks up the repo by `githubRepoId` in the database
- If found, triggers a background scan (same flow as `POST /api/scan/[repoId]`)
- Responds `200` immediately, scan runs asynchronously

---

### `POST /api/billing/webhook`

Stripe webhook handler. Processes subscription lifecycle events.

**File:** `src/app/api/billing/webhook/route.ts`

**Auth:** Stripe signature verification (`stripe-signature` header, using `STRIPE_WEBHOOK_SECRET`)

**Headers:**

| Header | Value |
|--------|-------|
| `stripe-signature` | Stripe webhook signature |

**Request body:** Raw Stripe event (parsed by `stripe.webhooks.constructEvent`)

**Handled events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Set `User.plan` to PRO or TEAM, set `User.stripeCustomerId` |
| `customer.subscription.updated` | Update `User.plan` based on new price ID |
| `customer.subscription.deleted` | Set `User.plan` to FREE |
| `invoice.payment_failed` | Optional: send email notification |

**Response: `200 OK`**

```typescript
interface StripeWebhookResponse {
  received: true;
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "Missing stripe-signature header" }` | No signature |
| 400 | `{ error: "Webhook signature verification failed" }` | Invalid signature |
| 400 | `{ error: "Unhandled event type" }` | Event not in handled list |

**Implementation notes:**
- Uses the raw request body (not parsed JSON) for signature verification: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
- Next.js App Router: read raw body via `request.text()` (do NOT use `request.json()`)
- Stripe client initialized with API version `2026-01-28.clover`
- Maps Stripe price IDs to plans:
  - `STRIPE_PRO_PRICE_ID` env var maps to `Plan.PRO`
  - `STRIPE_TEAM_PRICE_ID` env var maps to `Plan.TEAM`

---

## 8. Billing

### `POST /api/billing/checkout`

Create a Stripe Checkout session for upgrading to Pro or Team.

**File:** `src/app/api/billing/checkout/route.ts`

**Auth:** Required (session)

**Request body:**

```typescript
interface CreateCheckoutRequest {
  plan: "PRO" | "TEAM";
  quantity?: number; // Seats (Team only). Default: 1
  successUrl?: string; // Redirect after payment. Default: "/dashboard?upgraded=true"
  cancelUrl?: string; // Redirect on cancel. Default: "/dashboard/billing"
}
```

**Response: `200 OK`**

```typescript
interface CreateCheckoutResponse {
  url: string; // Stripe Checkout URL — redirect the user here
  sessionId: string; // Stripe session ID
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ error: "Invalid plan" }` | Plan not PRO or TEAM |
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 409 | `{ error: "Already on this plan" }` | User already on the requested plan |
| 500 | `{ error: "Failed to create checkout session" }` | Stripe API error |

**Implementation notes:**
- If the user already has a `stripeCustomerId`, uses it. Otherwise creates a new Stripe customer.
- Checkout session config:
  - `mode: "subscription"`
  - `payment_method_types: ["card"]`
  - `line_items`: Price ID from env (`STRIPE_PRO_PRICE_ID` or `STRIPE_TEAM_PRICE_ID`)
  - `client_reference_id`: User's database ID (used in webhook to find the user)
  - `customer_email`: User's email (if no Stripe customer exists yet)
  - `metadata: { userId, plan }`
- Pricing: Pro = $19/mo, Team = $29/seat/mo

---

### `POST /api/billing/portal`

Create a Stripe Billing Portal session for managing the existing subscription (upgrade, downgrade, cancel, update payment method).

**File:** `src/app/api/billing/portal/route.ts`

**Auth:** Required (session, must have active subscription)

**Request body:**

```typescript
interface CreatePortalRequest {
  returnUrl?: string; // Where to redirect after portal. Default: "/dashboard/billing"
}
```

**Response: `200 OK`**

```typescript
interface CreatePortalResponse {
  url: string; // Stripe Billing Portal URL — redirect the user here
}
```

**Error codes:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthorized" }` | No valid session |
| 400 | `{ error: "No active subscription" }` | User has no `stripeCustomerId` |
| 500 | `{ error: "Failed to create portal session" }` | Stripe API error |

**Implementation notes:**
- Requires the user to have a `stripeCustomerId` in the database
- Uses `stripe.billingPortal.sessions.create({ customer, return_url })`
- The portal allows users to: update payment method, view invoices, cancel subscription, switch plans

---

## 10. Error Handling

### Standard Error Envelope

All endpoints return errors in this format:

```typescript
interface ApiError {
  error: string; // Human-readable message
  code?: string; // Machine-readable code for client logic
}
```

### Common Error Codes

| Code | Meaning |
|------|---------|
| `PLAN_LIMIT` | Feature requires a higher plan tier |
| `RATE_LIMIT` | Too many requests |
| `VALIDATION_ERROR` | Request body failed validation |

### Auth Guard Pattern

Every authenticated endpoint should use this pattern:

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ... endpoint logic
}
```

### Ownership Verification Pattern

Endpoints that access a user's resources should verify ownership:

```typescript
const repository = await db.repository.findFirst({
  where: {
    id: repoId,
    userId: session.user.id,
  },
});

if (!repository) {
  return NextResponse.json(
    { error: "Repository not found" },
    { status: 404 }
  );
}
```

### Plan Gating Pattern

Endpoints restricted by plan tier:

```typescript
const user = await db.user.findUnique({
  where: { id: session.user.id },
  select: { plan: true },
});

if (user?.plan === "FREE") {
  return NextResponse.json(
    { error: "Upgrade required", code: "PLAN_LIMIT" },
    { status: 403 }
  );
}
```

---

## Environment Variables

These environment variables are required for the API routes:

```bash
# NextAuth
AUTH_SECRET=                    # NextAuth secret (openssl rand -base64 32)
AUTH_GITHUB_ID=                 # GitHub OAuth App client ID
AUTH_GITHUB_SECRET=             # GitHub OAuth App client secret

# Database
DATABASE_URL=                   # PostgreSQL connection string

# Stripe
STRIPE_SECRET_KEY=              # Stripe secret key (sk_...)
STRIPE_WEBHOOK_SECRET=          # Stripe webhook signing secret (whsec_...)
STRIPE_PRO_PRICE_ID=            # Stripe Price ID for Pro plan ($19/mo)
STRIPE_TEAM_PRICE_ID=           # Stripe Price ID for Team plan ($29/seat/mo)

# GitHub Webhooks
GITHUB_WEBHOOK_SECRET=          # Secret for verifying GitHub webhook signatures

# App
NEXT_PUBLIC_APP_URL=            # https://hashmark.md (used for redirect URLs)
```

---

## Endpoint Summary

| # | Method | Path | Auth | Plan | Purpose |
|---|--------|------|------|------|---------|
| 1 | GET/POST | `/api/auth/[...nextauth]` | Public | Any | NextAuth OAuth handlers |
| 2 | GET | `/api/repos` | Session | Any | List GitHub repos with connection status |
| 3 | POST | `/api/repos/connect` | Session | Any (1 repo limit on Free) | Connect repo to Hashmark |
| 4 | DELETE | `/api/repos/[repoId]` | Session + Owner | Any | Disconnect repo |
| 5 | POST | `/api/scan/[repoId]` | Session + Owner | Any | Trigger manual scan |
| 6 | GET | `/api/scan/[repoId]/latest` | Session + Owner | Any | Get latest scan results |
| 7 | GET | `/api/scan/[repoId]/history` | Session + Owner | Pro+ | Get scan history |
| 8 | GET | `/api/files/[repoId]/[format]` | Session + Owner | Any | Get generated file content |
| 9 | POST | `/api/files/[repoId]/download` | Session + Owner | Any | Download all files as zip |
| 10 | POST | `/api/action/install` | Session + Owner | Pro+ | Install GitHub Action |
| 11 | GET | `/api/action/status/[repoId]` | Session + Owner | Any | Check Action status |
| 12 | POST | `/api/rules` | Session | Pro+ | Create custom rule |
| 13 | PUT | `/api/rules/[ruleId]` | Session + Owner | Pro+ | Update custom rule |
| 14 | DELETE | `/api/rules/[ruleId]` | Session + Owner | Pro+ | Delete custom rule |
| 15 | POST | `/api/webhooks/github` | Webhook Sig | N/A | GitHub push event receiver |
| 16 | POST | `/api/billing/checkout` | Session | Any | Create Stripe checkout |
| 17 | POST | `/api/billing/portal` | Session | Pro+ | Manage subscription |
| 18 | POST | `/api/billing/webhook` | Webhook Sig | N/A | Stripe event handler |
