# Hashmark — User Journey Maps

Six end-to-end journeys covering the full Hashmark lifecycle: CLI discovery, web signup, repo connection, auto-sync installation, team onboarding, and custom rules configuration.

---

## J1: CLI Discovery to First Scan

**Persona**: All (solo dev, team lead, library author)
**Trigger**: Developer reads a blog post, HN thread, or tweet about AI context file fragmentation and sees the CLI command.
**Pre-conditions**: Node.js 22+ installed. Developer has a codebase with at least one `package.json`.

### Steps

1. **Terminal** -- Install and run the CLI.
   ```bash
   npx @jpoindexter/agent-smith .
   ```
   Expected output (5-15 seconds):
   ```
   Scanning /Users/dev/my-project...

   [1/27] Framework .............. Next.js 16 (App Router)
   [2/27] Components ............. 142 components found
   [3/27] API Routes ............. 23 routes (18 protected)
   ...
   [27/27] Complexity ............ 4 hotspots identified

   ✓ Generated AGENTS.md (11,247 tokens)
     → 142 components, 23 API routes, 14 hooks, 8 models

   💡 Want CLAUDE.md, .cursorrules, and 5 more formats?
      → https://hashmark.md (free to start)
   ```

2. **Terminal / Editor** -- Open the generated file.
   ```bash
   cat AGENTS.md | head -60
   ```
   Developer sees structured sections: TL;DR, Getting Started, Critical Rules (with WRONG/RIGHT examples), Components inventory, API Routes, Database Models, Design Tokens.

3. **"Wow" moment** -- Developer finds their full component inventory, anti-patterns they did not know about, and correct import paths documented automatically in under 15 seconds.

### Success Metric
Developer opens the generated `AGENTS.md` and spends 30+ seconds reading it (measured indirectly via CLI-to-signup conversion).

### Failure Points

| Failure | Recovery |
|---------|----------|
| `npx` fails (Node < 22, network error) | CLI prints version requirement and link to Node.js download |
| Scan produces empty/minimal output (non-JS project, empty repo) | CLI prints "No components found. Hashmark works best with JavaScript/TypeScript projects." with link to supported frameworks |
| AGENTS.md already exists and user fears overwrite | CLI prompts: "AGENTS.md already exists. Overwrite? [y/N]" (default: no). Use `--force` flag to skip prompt |

---

## J2: CLI to Web Signup

**Persona**: Solo dev or library author who just ran the CLI (J1 complete).
**Trigger**: CLI output footer: "Want CLAUDE.md, .cursorrules, and 5 more formats? -> hashmark.md"
**Pre-conditions**: GitHub account. J1 completed (developer saw value from AGENTS.md scan).

### Steps

1. **Terminal** -- Developer sees the upsell message at the bottom of CLI output and copies the URL.

2. **Landing Page** (`hashmark.md`) -- Developer lands on the marketing page. Sees the hero: "One scan. Every format. Always in sync." Scrolls to the 3-step diagram: Connect, Scan, Sync. Sees pricing table (Free: 1 repo, Pro: $19/mo unlimited).

3. **Landing Page** -- Developer clicks "Get Started Free" button (above the fold) or "Sign in with GitHub" in the nav.

4. **GitHub OAuth** (`github.com/login/oauth/authorize`) -- GitHub prompts for authorization. Scopes requested: `read:user`, `user:email`, `repo` (read access to list and clone repos). Developer clicks "Authorize Hashmark."

5. **Dashboard** (`hashmark.md/dashboard`) -- First-time user sees empty state: "Connect your first repo to get started." GitHub repos are listed below, pulled from the GitHub API. The repo the user just scanned locally is likely visible near the top (sorted by recent push).

### Success Metric
GitHub OAuth completed and user lands on dashboard (activation step 1 of 2).

### Failure Points

| Failure | Recovery |
|---------|----------|
| User does not trust granting repo access | Landing page FAQ: "We never store your source code. We clone temporarily, scan, and delete. Generated context files only." OAuth scope explanation on auth page |
| GitHub OAuth fails (rate limit, GitHub outage) | Redirect to `/auth/error` with "GitHub is temporarily unavailable. Try again in a few minutes." Retry button |
| User has no GitHub repos (brand new account) | Dashboard shows: "No repositories found. Push code to GitHub and come back." Link to GitHub's create-repo guide |

---

## J3: Connect First Repo

**Persona**: Solo dev or library author (J2 complete, on dashboard).
**Trigger**: User sees their GitHub repos listed on the dashboard and wants to scan one.
**Pre-conditions**: GitHub OAuth complete. User has at least one repo with code.

### Steps

1. **Dashboard** (`hashmark.md/dashboard`) -- User sees a list of their GitHub repos with metadata (name, language, last push date, star count). Each repo has a "Connect" button.

2. **Dashboard** -- User clicks "Connect" on a repo. Button changes to a spinner. Server action creates a `Repository` record in the database and triggers an initial scan.

3. **Scan Progress** (`hashmark.md/dashboard/[repoId]`) -- User is redirected to the repo detail page. A progress indicator shows scan status:
   ```
   Scanning your-org/your-repo...
   ■■■■■■■■□□ 80%  Analyzing components...
   ```
   Scan runs server-side: shallow clone to temp dir, `npx @jpoindexter/agent-smith <path> --json --force`, parse JSON, store results, clean up temp dir. Takes 10-30 seconds.

4. **Repo Intelligence** (`hashmark.md/dashboard/[repoId]`) -- Scan completes. Page populates with KPI cards:
   - Files: 847
   - Components: 142
   - API Routes: 23
   - Complexity Hotspots: 4
   - Anti-Patterns: 12

   Below the KPIs: component inventory table, API routes table, anti-patterns with WRONG/RIGHT examples, design tokens list.

5. **Generated Files** (`hashmark.md/dashboard/[repoId]/files`) -- User clicks "View Generated Files" tab. Sees all 8 formats in a tabbed preview:
   - AGENTS.md
   - CLAUDE.md
   - .cursorrules
   - .cursor/rules/project.mdc
   - .github/copilot-instructions.md
   - .windsurfrules
   - GEMINI.md
   - .clinerules

   Each tab shows a syntax-highlighted preview. "Download" button per file and "Download All (ZIP)" button at top.

6. **Download** -- User downloads the files they need (or all via ZIP) and drops them into their repo.

### Success Metric
User completes a scan and downloads at least one generated file (activation complete: connected repo + viewed results).

### Failure Points

| Failure | Recovery |
|---------|----------|
| Scan fails (repo too large, unsupported language, timeout) | Dashboard shows "Scan failed" with error message and "Retry" button. If persistent, link to support or suggest excluding directories via config |
| Scan produces sparse results (tiny repo, no components) | Show results with a note: "This repo has minimal structure. Hashmark works best with projects that have components, API routes, or database schemas." Still generate all 8 formats with available data |
| Clone fails (private repo, insufficient permissions) | Show "Unable to access this repository. Please check that you granted repo access during sign-in." Button to re-authorize with correct scopes |
| Free user tries to connect a second repo | Soft paywall: "Free plan includes 1 connected repo. Upgrade to Pro for unlimited repos." Upgrade button links to Stripe checkout |

---

## J4: Install GitHub Action (Pro Feature)

**Persona**: Solo dev or team lead on Pro plan who wants auto-sync.
**Trigger**: User has scanned a repo (J3 complete), sees the value, and does not want to manually re-scan after every code change.
**Pre-conditions**: Pro or Team plan active. Repo connected and scanned at least once.

### Steps

1. **Repo Detail** (`hashmark.md/dashboard/[repoId]`) -- User sees a banner or card: "Enable Auto-Sync -- Keep your AI context files updated on every push." Button: "Install GitHub Action."

2. **Action Setup Modal** -- Clicking the button opens a modal with:
   - Preview of the workflow YAML (`hashmark.yml`)
   - Configuration options:
     - **Formats**: Checkboxes for each of the 8 formats (all checked by default)
     - **Mode**: "Auto-commit" (default) or "Create PR" (for teams that want review)
     - **Branch trigger**: `main` (default), editable
   - Explanation: "This will create `.github/workflows/hashmark.yml` in your repository."

3. **One-Click Install** -- User clicks "Install Action." Server calls GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/.github/workflows/hashmark.yml`) with the generated YAML. The workflow file is committed directly to the default branch.

4. **Confirmation** (`hashmark.md/dashboard/[repoId]`) -- Modal closes. Repo card now shows a green "Auto-Sync: Active" badge. Dashboard displays:
   ```
   ✓ GitHub Action installed
   Next sync: On your next push to main
   ```

5. **First Auto-Sync** (happens later, in user's repo) -- Developer pushes code to main. GitHub Actions runs `hashmark.yml`:
   - Checks out repo
   - Runs `npx @jpoindexter/agent-smith . --json --force`
   - Generates all selected formats
   - Compares with existing files
   - If changed: commits updated files with message "chore: sync AI context files [hashmark]"
   - If unchanged: exits cleanly (no commit)

6. **Dashboard Update** -- If webhook is configured, dashboard updates with the latest scan. User sees "Last synced: 2 minutes ago" on their repo card.

### Success Metric
GitHub Action runs successfully on next push and commits updated context files (north star metric: repos with active auto-sync).

### Failure Points

| Failure | Recovery |
|---------|----------|
| GitHub API rejects workflow creation (insufficient permissions, branch protection) | Modal shows: "Unable to create workflow file. Your repo may have branch protection rules. You can manually add the file." Shows copyable YAML and manual instructions |
| Action fails on first run (Node version, agent-smith error) | GitHub Action logs show error. Dashboard shows "Last sync: Failed" with link to GitHub Actions log. User can re-trigger via `workflow_dispatch` |
| Infinite loop (action commit triggers action) | Prevented by `paths-ignore` in workflow YAML. Backup: commit author check (`hashmark[bot]` skips) |
| Free user clicks "Install Action" | Paywall modal: "Auto-sync is a Pro feature. Upgrade for $19/mo to keep your context files always up to date." Upgrade button |

---

## J5: Team Onboarding (Team Feature)

**Persona**: Engineering manager or tech lead at a 5-20 person team.
**Trigger**: Manager sees inconsistent AI output across team members. Different developers have different (or no) context files. A PR review reveals AI-generated code that ignores team conventions.
**Pre-conditions**: Team plan active ($29/seat/mo). At least one repo connected and scanned.

### Steps

1. **Settings** (`hashmark.md/settings/team`) -- Team admin navigates to Settings > Team. Sees current seat count and usage.

2. **Invite Members** -- Admin clicks "Invite Team Member." Enters email addresses (one per line or comma-separated). Selects role: "Member" (can view/scan) or "Admin" (can manage rules, billing). Clicks "Send Invites."

3. **Invitation Email** -- Invited members receive an email:
   ```
   Subject: Join [Org Name] on Hashmark

   [Admin Name] invited you to [Org Name] on Hashmark.
   Your team uses Hashmark to keep AI context files in sync.

   [Accept Invitation] → hashmark.md/invite/[token]
   ```

4. **Member Onboarding** (`hashmark.md/invite/[token]`) -- Invited member clicks the link. If not signed in, they go through GitHub OAuth first (J2 flow). After auth, they land on the team dashboard with all connected repos visible.

5. **Org-Wide Rules** (`hashmark.md/settings/rules`) -- Admin navigates to Settings > Rules. Creates org-wide custom rules that apply to ALL repos in the organization:
   - "Always use pnpm, never npm or yarn"
   - "Use design tokens from our design system, never hardcode colors"
   - "All components must be in TypeScript with explicit prop types"
   - "Use existing components from @company/ui before creating new ones"

   These rules are injected into the "Critical Rules" section of every generated context file for every connected repo.

6. **Team Dashboard** (`hashmark.md/dashboard`) -- Admin sees all connected repos across the organization in one view. Each repo shows: last scan date, auto-sync status, number of components, anti-pattern count. Admin can filter by team member, repo status, or scan health.

7. **Consistency Verification** -- All team members' AI tools (Cursor, Claude Code, Copilot, etc.) now receive identical, up-to-date context files. Every repo gets the same org rules. New team members get correct context from day one without any setup.

### Success Metric
All team repos have auto-sync active with org-wide rules applied, and new team members are onboarded within 24 hours of invitation.

### Failure Points

| Failure | Recovery |
|---------|----------|
| Invited member does not have a GitHub account | Invitation email includes: "You need a GitHub account to use Hashmark. Create one at github.com/signup." |
| Invited member ignores the email | Admin sees "Pending" status on the team page. Can resend invitation or copy the invite link to share via Slack/DM |
| Team exceeds seat limit | When adding the Nth+1 member beyond purchased seats: "You have used all N seats. Add more seats to invite additional members." Link to billing page |
| Org rules conflict with repo-specific scan results | Rules are additive. Org rules appear in a dedicated "Team Rules" section in generated files, clearly separated from auto-detected rules. No conflict resolution needed |

---

## J6: Custom Rules

**Persona**: Solo dev (Pro) or team admin (Team) who wants to enforce specific conventions beyond what the scanner detects.
**Trigger**: Developer notices AI tools are not following a convention that the scanner did not detect (e.g., "always use pnpm" or "never use class components").
**Pre-conditions**: Pro or Team plan active. At least one repo connected.

### Steps

1. **Settings** (`hashmark.md/settings/rules`) -- User navigates to Settings > Rules. Sees two sections:
   - **My Rules** (Pro): Apply to all of this user's repos.
   - **Org Rules** (Team only): Apply to all repos in the organization.

2. **Add Rule** -- User clicks "Add Rule." A form appears:
   - **Rule name** (required): Short label, e.g., "Use pnpm"
   - **Rule description** (required): The instruction to inject into context files, e.g., "Always use pnpm for package management. Never use npm or yarn. All lock files should be pnpm-lock.yaml."
   - **Scope** (optional): Glob pattern to limit which files this rule applies to. Default: all files. Example: `**/*.tsx` for React components only.
   - **Category** (optional): Select from "Package Management", "Components", "Styling", "Testing", "Architecture", "Security", "Custom."

3. **Preview** -- After entering the rule, user clicks "Preview." A side panel shows how the rule will appear in each of the 8 generated formats. For example, in AGENTS.md:
   ```markdown
   ## Custom Rules

   ### Use pnpm
   Always use pnpm for package management. Never use npm
   or yarn. All lock files should be pnpm-lock.yaml.
   ```

4. **Save** -- User clicks "Save Rule." Rule is stored in the `CustomRule` table. A toast notification confirms: "Rule saved. It will be included in your next scan."

5. **Re-scan** -- User can either:
   - Wait for the next auto-sync (GitHub Action push) to include the new rule.
   - Click "Re-scan" on a repo to immediately regenerate files with the rule included.

6. **Verify** -- After rescan, user opens the generated files (or checks the repo after auto-sync commit) and confirms the custom rule appears in the "Custom Rules" section of each format.

### Example Rules

| Rule Name | Description |
|-----------|-------------|
| Use pnpm | Always use pnpm for package management. Never use npm or yarn. |
| No class components | Never use React class components. Always use functional components with hooks. |
| Design tokens only | Never hardcode colors (e.g., `bg-blue-500`). Always use semantic tokens (`bg-primary`, `text-foreground`). |
| Server components default | Default to React Server Components. Only add `"use client"` when the component needs interactivity, hooks, or browser APIs. |
| Import order | Order imports: 1) React/Next.js, 2) External libraries, 3) Internal packages, 4) Relative imports. Separate groups with blank lines. |

### Success Metric
User creates at least one custom rule and it appears in the next generated context file.

### Failure Points

| Failure | Recovery |
|---------|----------|
| User writes a vague or overly broad rule | Rule form includes placeholder examples and a tip: "Be specific. Instead of 'write good code', try 'Always add error boundaries around async components.'" |
| Rule does not appear in generated files | Settings page shows rule status: "Active" (included in last scan) or "Pending" (not yet included). "Re-scan now" button to force regeneration |
| Too many rules (dilutes context file quality) | Dashboard shows rule count with a warning at 20+ rules: "Having too many rules can reduce AI tool effectiveness. Consider consolidating related rules." |
| Free user tries to add a rule | Settings > Rules shows: "Custom rules are a Pro feature. Upgrade for $19/mo." Upgrade button links to Stripe checkout |

---

## Journey Summary

| Journey | Trigger | End State | Plan Required |
|---------|---------|-----------|---------------|
| J1: CLI Discovery | Blog post, tweet, HN | AGENTS.md generated locally | None (free CLI) |
| J2: CLI to Web Signup | CLI upsell message | GitHub OAuth complete, on dashboard | Free |
| J3: Connect First Repo | Dashboard empty state | Scan complete, files downloaded | Free (1 repo) |
| J4: Install GitHub Action | "Enable Auto-Sync" banner | Action running on every push | Pro ($19/mo) |
| J5: Team Onboarding | Inconsistent AI across team | All members onboarded, org rules active | Team ($29/seat/mo) |
| J6: Custom Rules | AI ignoring a convention | Rules injected into all generated files | Pro ($19/mo) |

### Conversion Funnel

```
J1: CLI Discovery (free, no signup)
 │
 ├── 47% read blog → install CLI (proven)
 │
 ▼
J2: CLI → Web Signup (free tier)
 │
 ├── Target: 5-10% of CLI users sign up
 │
 ▼
J3: Connect First Repo (free tier, activation)
 │
 ├── Target: 50% of signups connect a repo
 │
 ▼
J4: Install GitHub Action (Pro $19/mo, conversion)
 │
 ├── Target: 10% of activated users upgrade
 │
 ▼
J5: Team Onboarding (Team $29/seat/mo, expansion)
 │
 ├── Target: 5% of Pro users bring their team
 │
 ▼
J6: Custom Rules (Pro/Team, retention & depth)
 │
 └── Target: 40% of paying users create rules
```
