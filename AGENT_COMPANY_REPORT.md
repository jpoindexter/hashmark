# hashmark — Full Agent Company Report
> Generated 2026-03-28 · 22 agents · branch: feature/shell-redesign

---

## Executive Summary

hashmark is evolving from a CLI context generator into a full agent orchestration IDE. The bones are strong — the architecture is thoughtful, the design system is cohesive, and several features (governance, drift detection, worktree isolation) are genuinely ahead of competitors. But the product is mid-transition: two separate surfaces (the Next.js web app and the Studio desktop app) haven't been unified under a single story, the core loop isn't discoverable on first launch, and several critical technical risks exist that need to be addressed before wider distribution.

**Overall health: 6/10** — solid foundation, high-priority gaps in security, testing, and product clarity.

---

## Scores by Domain

| Agent | Score | Key Finding |
|-------|-------|-------------|
| Frontend Developer | 6/10 | `--surface` token undefined, dual toast systems, accessibility gaps |
| Backend Architect | 5/10 | No authentication on any route, critical correctness bugs |
| Database Architect | 5/10 | Only 1 index, duplicate swarm tables, no migration versioning |
| Security Engineer | 3/10 | No auth, open CORS, no CSRF protection, API keys in plaintext |
| DevOps | 5/10 | No PR CI pipeline, `dist/` committed, no `.env.example` |
| SRE | 5/10 | No process timeouts, hung agents block indefinitely |
| Test Coverage | 1/10 | ~0% coverage on all critical paths, broken vitest config |
| Performance | 5/10 | 6.5MB Shiki bundle, N+1 git diffs, no session pagination |
| UX | 5/10 | Core feature hidden, two onboarding flows, fake ContextPanel data |
| Product Manager | 6/10 | Product outgrew its positioning; navigation hides 80% of features |
| UI Designer | 6/10 | Token system solid but has light-mode holes |
| Brand Guardian | 6/10 | mission/session naming split is the biggest damage |
| Legal Compliance | 3/10 | No privacy policy, no ToS, GDPR gaps before launch |
| Analytics | 3/10 | Broken stat columns, token estimates wrong, no aggregate view |
| Growth | 6/10 | GitHub badge virality in place; SEO opportunity unclaimed |
| SEO | 1/10 | Desktop app has no web surface (correct — marketing site is separate repo) |
| Content | 7/10 | Strong content plan exists in docs/MARKETING.md, just needs execution |
| AI Engineering | 7/10 | Multi-CLI detection smart; governance ahead of curve |
| Project Tracking | 5/10 | 265+ commit gap to main, Tauri/Electron undecided, dist/ in git |

---

## 🚨 Critical Issues (Fix Before Launch)

### 1. No Authentication on the Local API Server
**Files:** `server/index.ts`, all routes in `server/routes/`

The Hono server running on `localhost:3200` has zero authentication. `cors({ origin: "*" })` is set globally. Any webpage a user visits can make requests to every API endpoint — including `POST /api/sessions/:id/chat` (spawns Claude with full filesystem access), `POST /api/files/delete`, `DELETE /api/sessions/:id`, and `POST /api/workspaces` (redirects the entire server to operate on an attacker-chosen directory).

**Fix:** Generate a random token on server start, store in `.hashmark/studio.token`, require it as `Authorization: Bearer <token>` on all state-mutating routes. Also replace `cors({ origin: "*" })` with `origin: "http://localhost:3200"`.

### 2. Shell Injection via `providers.ts`
**File:** `server/lib/providers.ts:85`

```ts
const versionRaw = tryExec(`"${binPath}" ${tool.versionFlag}`);
```
`tryExec` calls `execSync` with shell string construction. `binPath` comes from `which` output. Use `spawnSync` with an explicit args array instead.

### 3. Governance Route Uses Wrong Directory
**File:** `server/index.ts:156`

`governanceRoutes(opts.projectDir)` should be `governanceRoutes(ctx.dataDir)`. This means every governance query is running against the wrong path after a workspace switch.

### 4. Duplicate + Broken Swarm Tables
**Files:** `server/db.ts`, `server/routes/swarm.ts`

Two separate table schemas exist for swarm data: `swarm_workers` (created in `db.ts` `migrate()`) and `swarm_agents` (created in `swarm.ts` `ensureSwarmTables()`). They have no FK relationship. The `swarm_runs.merged_count`, `conflict_count`, `skipped_count` columns exist in the schema but are **never written to** by the actual swarm route. All aggregate swarm stats are lost at process exit.

### 5. No Legal Documents Before Wider Distribution
**Missing:** Privacy Policy, Terms of Service, EULA for Electron app

The `pushToCloud` function in `auth.ts` sends `projectRoot` (contains username — personal data under GDPR) without any privacy notice. The CLI `hashmark login` opens a browser OAuth flow with no disclosure. Before expanding distribution: publish a Privacy Policy at `hashmark.md/privacy` and add a one-liner disclosure at login.

---

## Engineering

### Frontend

**Score: 6/10**

**Strengths:**
- Design token system (`tokens.css`) is comprehensive with 50+ variables
- Component composition is clean; page-level separation is good
- Shell.tsx's event-bus architecture for cross-component communication is appropriate

**Issues:**
- `--surface` and `--surface-2` tokens referenced in `Home.tsx` are undefined — transparent backgrounds on mission cards
- Two toast systems: inline toast array in `Shell.tsx` (lines 92, 480–496) and `Toasts.tsx` with `useSyncExternalStore`. They create two overlapping toast layers
- `Shell.tsx` is 499 lines and manages session lifecycle, streaming state, event bus, keyboard shortcuts, native menus, and UI state. Needs decomposition into `useSessionManager`, `useStreamingSession`, `useStudioEvents`
- `useState(hovered)` pattern in 22+ components instead of CSS `:hover` — unnecessary re-renders on every mouse movement
- No focus trap in any modal (`ConfirmDialog`, `CommandPalette`, `ShortcutsHelp`, `AboutDialog`, `DispatchModal`)
- `SessionsPanel` session rows are `<div onClick>` with no `role="button"`, `tabIndex`, or `onKeyDown` — keyboard inaccessible
- `XTerminal` colors hardcoded VS Code dark (`#1e1e1e`, `#cccccc`) — doesn't adapt to light theme or Void palette
- `Skeleton.tsx` and `PageTransition.tsx` inject `<style>` tags via direct DOM mutation at render time

**Priority Fixes:**
1. Add `--surface: var(--bg-2)` to tokens.css — 2-line fix, unbreaks Home.tsx
2. Remove inline toast array from Shell.tsx, route everything through `Toasts.tsx` event bus
3. Add `useFocusTrap` hook to all modals
4. Add `role="button"` + `tabIndex={0}` + `onKeyDown` to all interactive divs
5. Wire XTerminal colors to CSS variables

---

### Backend Architecture

**Score: 5/10**

**Strengths:**
- Hono server is clean and well-structured
- WebSocket terminal proxy with proper PTY management
- SSE streaming architecture is sound
- MCP bridge integration is thoughtful

**Issues (Critical):**
- No auth on any route (see Critical Issues #1)
- `activeRun` race condition: `if (!activeRun) { activeRun = true; await fn() }` — the gap between the check and the set is non-atomic; two simultaneous requests can both pass the check
- DELETE `/api/run` sets `activeRun = false` but doesn't kill the running process — the child continues running after the client thinks it stopped
- `findClaudeBin` duplicated across `runner.ts`, `run.ts`, `swarm.ts`, `sessions.ts` with slightly different candidate lists (`run.ts:67` missing `/opt/homebrew/bin/claude` that `sessions.ts:73` has)
- Governance route passes wrong directory (see Critical Issues #3)

**Issues (Medium):**
- SQLite singleton captured by routes before workspace switch doesn't update — stale DB reference risk
- Token estimates are `Math.ceil(body.message.length / 4)` — off by 30-50% for code
- Action log (`governance.ts:107`) reads entire file with `readFileSync` with no size guard — could block event loop on large projects
- Session IDs in `sandbox.ts` not validated — any string accepted as map key

**Recommendations:**
- Extract `findClaudeBin` to `server/lib/bin-resolver.ts`
- Add Zod validation on the 5 highest-traffic routes
- Pass DB instance through the `WorkspaceCtx` context object rather than module-level singleton

---

### Database

**Score: 5/10**

**Schema Assessment:**
- 10 core tables with sensible column choices
- WAL mode + better-sqlite3 synchronous pattern is correct for local single-process use
- The `session_messages` index (`idx_messages_session`) is the one useful index

**Critical Issues:**
- **Only 1 index exists** for a schema with 10+ tables. Missing high-value indexes:
  ```sql
  CREATE INDEX idx_sessions_archived_updated ON sessions(archived, updated_at DESC);
  CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
  CREATE INDEX idx_agent_actions_created ON agent_actions(created_at DESC);
  CREATE INDEX idx_agent_actions_agent ON agent_actions(agent_id);
  CREATE INDEX idx_runs_started ON runs(started_at DESC);
  ```
- **No migration versioning** — no `schema_version` table, no way to know which migrations have run
- **Migrations scattered** — `runs` table columns added inside route handlers (`run.ts:100-103`) instead of `migrate()`
- **Duplicate swarm tables** — `swarm_agents` and `swarm_workers` exist as separate schemas with no FK link (see Critical Issues #4)
- **N+1 in checkpoint listing** — `server/routes/checkpoints.ts:38–96` runs 2 git invocations per checkpoint; 50 checkpoints = 100 sequential `git` calls per GET request
- **Session search is a correlated subquery** with `LIKE '%query%'` — full table scan, no index usable. Add FTS5 virtual table

---

### Security

**Score: 3/10**

**Critical:**
- No authentication on any route (open to CSRF from any webpage)
- `cors({ origin: "*" })` — wildcard allows cross-origin requests from anywhere
- `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1"` passed to every spawned process — full filesystem access, no enforcement between governance policies and actual agent spawns
- Shell injection via `execSync` template string in `providers.ts:85`
- Workspace route accepts any arbitrary filesystem path — can redirect server to operate on `/etc`, `~/.ssh`
- API keys stored in plaintext `.hashmark/providers.json`

**Missing Protections:**
- No CSRF protection (no `SameSite`, no token)
- No rate limiting on any endpoint
- No input length caps on `message`, `task`, or search `q` parameters
- No Content-Security-Policy header
- No X-Frame-Options or X-Content-Type-Options headers
- No audit logging for destructive operations

**What's Done Well:**
- OAuth CSRF state token validation
- Credentials stored with `chmod 0600`
- API key masking in providers endpoint (returns `hasKey: Boolean(...)`, not actual value)
- Cloud sync is opt-in (`--sync` flag)
- `detectSecrets` scans content before cloud upload
- Path traversal checks in file serving routes

---

### Reliability (SRE)

**Score: 5/10**

**Critical:**
- **No timeout on spawned claude/codex/gemini processes** — a hung agent holds SSE open indefinitely. The only backstop is a 30-minute session idle eviction. Add a 10-minute `setTimeout` that sends SIGTERM
- **`activeRun` leak** — if a run crashes, the flag stays `true` and new runs are blocked until server restart
- **Orphaned worktrees** — `studio-run-*` and `swarm-*` temp dirs in `/tmp` are never cleaned up on server start

**Medium:**
- Health check at `GET /api/health` returns `{ ok: true }` without checking DB connectivity or claude binary availability — passes when the server is broken
- `analyzeSessionLoop` runs O(n²) similarity comparisons synchronously in-process, blocks event loop on long sessions
- No structured request logger — no baseline audit trail of what routes are being called

**Recommendations:**
- Add Hono `logger()` middleware (3 lines)
- Upgrade health check to verify DB write access and claude binary exists
- Add `ErrorBoundary` around `AppShell` in `App.tsx`

---

### Testing

**Score: 1/10**

**Current state:** Near-zero coverage on all critical paths.

| Area | Coverage |
|------|----------|
| Auth token flow | 0% |
| Session create + chat route | 0% |
| CLI generator pipeline | 0% |
| MCP server | 0% |
| `secrets.ts` scanner | 0% |
| `ast-complexity.ts` | ~70% (the one tested file) |
| CLI utils (bm25, chunk-markdown, etc.) | ~25% |

**Structural problems:**
- Root `vitest.config.ts` targets `src/**` — that directory doesn't exist. Running `npm test` at root produces 0 results with no errors (silently dead)
- Playwright e2e specs live in `.hashmark/snapshots/` — not a runnable test directory, no `playwright.config.ts`, no `test:e2e` script
- `packages/cli/vitest.config.ts` has a stray `import { Button }` from a component library that throws at config load time
- E2e specs use `waitForTimeout(300)`, `waitForTimeout(1000)` throughout — Playwright anti-pattern, flaky on CI

**Priority: What to Test First:**
1. Fix root vitest config (5 minutes, unlocks all tests)
2. Auth token flow — highest blast radius
3. Session create + chat route — core user action
4. `secrets.ts` scanner — false negatives are a security issue
5. `generator.ts` output — the CLI's primary deliverable

---

### Performance

**Score: 5/10**

**Client-side:**
- **Shiki syntax highlighter is ~6.5MB** in the shipped bundle — loads all 200+ language grammars and 50+ themes. Restrict to the 14 languages actually used: `createHighlighter({ langs: ['typescript', 'python', 'bash', ...] })`
- `AssistantContent` re-renders on every streaming chunk — add `React.memo` and batch `setStreamText` to fire at most every 50ms
- Home/Company page polling (`setInterval(8000)`) continues when tab is hidden — add `document.visibilitychange` guard

**Server-side:**
- **N+1 git diff pattern** in Git panel — `Promise.all(files.map(f => execAsync("git diff --numstat " + f)))` instead of one `git diff --numstat HEAD`
- CLAUDE.md read from disk 2x per chat turn — cache in memory at server start, watch for changes with `fs.watch`
- Context analytics writes to disk on every chunk during streaming — debounce to flush on stream completion
- Session list has no LIMIT — returns all sessions on every load

**Database:**
- Missing 7 high-value indexes (see Database section)
- Session search is a full-table LIKE scan
- `GET /api/sessions/:id` loads all messages with no pagination — 1MB+ for long sessions
- `/api/sessions/:id/tokens` endpoint runs 5 correlated subqueries then loads all content into Node for character counting

---

## Product & Design

### UX Audit

**Score: 5/10**

**Critical flow breakdowns:**

1. **The core feature (Generate) is unreachable from first launch.** The Rail shows 2 icons. Generate, Run, Swarm, History, Governance are hidden routes. A first-time user has no path to the product's primary function.

2. **Two separate onboarding flows exist simultaneously.** `WorkspaceSetup.tsx` (3-step wizard) and the `ProjectPicker` in `Home.tsx` are parallel paths with different step counts, different copy, and no shared completion state.

3. **Dispatch modal silently fails.** `POST /api/sessions` failure shows no error — the modal closes and nothing happens. The user assumes the mission launched.

4. **WorkspaceSetup Step 3 MCP poll never times out.** `setInterval` runs indefinitely. If the MCP server never starts, the checklist hangs forever.

5. **App renders blank screen on initial load.** `AppShell` while `configured === null` is an empty `<div>`. No skeleton, no logo, no loading state — users see a white/dark flash.

**Missing states:**
- Agents page: no empty state when `agents.length === 0`
- Generate: no output file path shown after scan completes
- Swarm: no explanation of what Swarm does to a first-time user
- Home missions: no skeleton during first fetch (polls every 8s but shows nothing)

**Prioritized Fix Backlog:**

| P | Issue | Effort |
|---|-------|--------|
| P0 | Dispatch modal shows no error on failure | Low |
| P0 | Generate not accessible from Rail | Low |
| P0 | WorkspaceSetup MCP poll timeout | Low |
| P0 | App blank initial load | Low |
| P1 | Agents page empty state | Low |
| P1 | Generate: show output file path | Low |
| P1 | "attach codebase context" toggle is non-functional | Medium |
| P1 | Navigation discovery (keyboard shortcut hint) | Low |
| P2 | Generate scan options use CLI flag syntax | Low |
| P2 | Home mission skeleton on first fetch | Low |

---

### Product Manager

**Score: 6/10**

hashmark started as a context generator (CLAUDE.md/AGENTS.md for AI coding assistants) and has evolved into a full agent orchestration IDE. The product now has multi-CLI provider detection, governance + audit log, worktree-isolated swarm mode, drift indicators, and plan/build mode. These are genuinely strong differentiators.

**Positive signals in the build:**
- Multi-CLI provider detection (Claude, Codex, Gemini, Amp, Aider, Goose) — smart tool-agnostic positioning
- Governance + action log — no competitor has this; enterprise teams will need audit trails
- Worktree-isolated swarm — technically sound and genuinely hard to replicate
- "Drift indicator" (commits since last context scan) — a real workflow pain solved
- Plan/build mode toggle — mirrors how professional developers actually use agents

**Warning signals:**
- The product has expanded without a clear repositioning. URL is still `hashmark.md`. Rail logo is still `#`. Brand hasn't caught up to the product
- "Company", "Governance", "Swarm" as route names are internal/enterprise language that doesn't land on a solo developer
- No pricing or upgrade flow in the Studio — monetization lives entirely in the separate Next.js web app. A developer using only the desktop app has no path to paid features
- The context generation origin (Generate page) is the product's most differentiated feature and it's the hardest to find

**Top 5 Product Priorities:**
1. Fix navigation — add Generate and Run to Rail as primary items
2. Unified onboarding flow on first launch (pick folder → generate context → create first mission)
3. Activate the "attach codebase context" toggle — this is the bridge between the two halves of the product
4. Brand and language alignment (see Brand Guardian section)
5. Bundle 5–8 starter agent definitions with the app so Run/Swarm are immediately usable

---

### UI Designer

**Score: 6/10**

**Token system (8/10):** Comprehensive, well-named, covers most surfaces. Dark theme is solid.

**Light theme holes (critical):**
- `StatusBar.tsx:53` — `color: "rgba(0,0,0,0.8)"` on dark accent background. In light mode `--accent: #1a1a1a` makes text unreadable
- 6 modal/overlay backdrops hardcoded as `rgba(0,0,0,0.5)` — too dark in light mode. Need `--overlay-bg` token
- 15+ `boxShadow: "0 Npx Mpx rgba(0,0,0,X)"` hardcoded values — none adapt to light mode

**Token gaps:**
- `--surface` and `--surface-2` referenced in `Home.tsx` but undefined (see Frontend section)
- `--orange` and `--purple` missing — `ToolSummary.tsx` falls back to GitHub-palette hardcoded values
- `--font` and `--font-ui` are identical — meaningless distinction, adds confusion

**Void identity violations:**
- `GitSidebar.tsx` status colors are GitHub palette (`#cca700`, `#2ea043`, `#f85149`, `#58a6ff`) — replace with muted Void equivalents
- `SessionsSidebar.tsx` `AVATAR_COLORS` is a 52-entry rainbow table — contradicts the zero-hue system entirely
- `#c084fc` raw purple in `SessionsPanel.tsx` `AGENT_COLORS`

**Typography (6/10):**
- Font sizes are all hardcoded integers (10, 11, 12, 13) — no scale tokens referenced
- `Badge.tsx` uses `fontSize: 9` — below readable threshold on low-DPI displays
- Compact density override has minimal visual effect because components ignore `--font-size-base`

---

### Brand Guardian

**Score: 6/10**

**The mission/session naming split is the most damaging brand issue.** The same object is called:
- "session" in `SessionsPanel`, `Sessions.tsx`, `/api/sessions`
- "mission" in `Home.tsx`, `DispatchModal`, the mission board, `studio:open-mission` events

A user who creates a "mission" on the home screen and then opens the sessions panel sees two different names for the same thing. **Pick one and use it everywhere.** Recommendation: keep "mission" for the UI (it's more distinctive and aligns with the agent/company metaphor), but the APIs can stay as `sessions` internally.

**Other copy issues:**
- Title Case in buttons: `\"Generate Context\"`, `\"Select all\"`, `\"Explore\"`, `\"Execute\"`, `\"Launch Swarm (3)\"` — everything else is lowercase
- Settings descriptions read as corporate SaaS boilerplate: `\"Customize how the studio looks and feels.\"` → cut it
- "context" used with 4 different meanings across the UI (context files, context window, codebase context, MCP context)
- Studio casing inconsistent: `\"Open Studio\"` vs lowercase everywhere else

---

## Operations

### DevOps

**Score: 5/10**

**What's in place:**
- Comprehensive pre-commit hooks (file size, security checks, component validation, lint-staged, commitlint)
- Pre-push hook runs typecheck + build
- 4 GitHub Actions workflows (npm publish, binary release, hashmark scan, PR labeler)
- Vercel deployment configured

**Critical gaps:**
- **No CI workflow for pull requests.** Pre-commit hooks are bypassable and don't run in CI. A bad PR can merge silently
- **No staging environment or preview deploy pipeline**
- **No `.env.example`** — new contributors have no reference for required variables
- **`hashmark-scan.yml` runs `npm install -g hashmark`** — installs latest published version, not the version in this repo. A published bug will corrupt AI context files on every push to main
- **`dist/` is committed to git** — build artifacts in source control, hundreds of untracked files in every `git status`
- **Binaries built only on `ubuntu-latest`** — macOS arm64 binaries built on Linux may have subtle issues

**Priority fixes:**
1. Add `.github/workflows/ci.yml` triggered on `pull_request` — lint, typecheck, test
2. Add `.env.example` with all required variables documented
3. Fix `hashmark-scan.yml` to install from repo: `npm install -g .`
4. Add `"prepare": "husky"` to root `package.json` for automatic hook setup
5. Add `dist/` to `.gitignore`

---

### Analytics

**Score: 3/10**

**What's tracked:**
- Context analytics per session (`context-analytics.ts`) — which CLAUDE.md sections were referenced, stored as JSON per session
- Agent action log (`action-log.ts`) — JSONL per session, governance tab reads it
- Basic session timestamps (`created_at`, `updated_at`)

**What's broken:**
- `swarm_runs.merged_count`, `conflict_count`, `skipped_count` columns exist in schema but are **never written** — all swarm aggregate data is lost
- Token counts use `Math.ceil(body.message.length / 4)` — off by 30–50% for code
- `sessions.model` saved as literal `'claude'` string — the actual model from `body.model` is never persisted

**What can't be measured today:**
- Session duration (no `started_at`/`ended_at`)
- Error rate (errors mixed into message content, not typed)
- Feature adoption (Run vs Swarm vs Chat)
- Agent performance by agent-id
- Time-to-first-value

**Priority fixes:**
1. Fix `swarm_runs` stats columns — write `merged_count`, `conflict_count` during swarm execution
2. Fix token counting — parse the `usage` field from `--output-format stream-json` response
3. Add `model` column update on chat — save actual model name from `body.model`
4. Add `started_at` + `ended_at` + `error_count` to sessions table
5. Add `GET /api/analytics/summary` endpoint

---

### Legal Compliance

**Score: 3/10**

**Missing before launch:**
- No Privacy Policy (`hashmark.md/privacy`)
- No Terms of Service (`hashmark.md/terms`)
- No EULA for the Electron/Tauri distributed binary
- No privacy disclosure at `hashmark login` (OAuth flow opens with no notice)
- `pushToCloud` sends `projectRoot` (contains username — personal data under GDPR) without notice

**GDPR gaps:**

| Requirement | Status |
|-------------|--------|
| Right to access (Article 15) | No mechanism |
| Right to erasure (Article 17) | No mechanism |
| Right to data portability (Article 20) | No mechanism |
| Privacy notice at collection | Missing |
| Data retention policy | Not defined |

**What's done well:**
- OAuth CSRF state token validation
- Credentials stored with `chmod 0600`
- Cloud sync is strictly opt-in
- Secret detection before cloud upload
- Local-first by default — conversation data never leaves the machine

**Action items:**
1. Write and host Privacy Policy before any wider distribution
2. Write and host Terms of Service
3. Add disclosure line to `hashmark login` CLI flow
4. Add `hashmark logout --delete-cloud-data` for GDPR Article 17
5. Fix CORS wildcard (also a security fix)

---

## Growth & Marketing

### Growth Hacker

**Top 5 experiments to run immediately:**

1. **Activate watermark badge virality** — the `/* Generated by hashmark */` comment is in every output file, but there's no badge. Add a `[![hashmark synced](https://img.shields.io/badge/hashmark-synced-green)](https://hashmark.md)` to repo READMEs on first GitHub Action run. Every repo becomes a passive acquisition channel
2. **Make the GitHub repo public + Marketplace listing** — developers searching for "AI context file GitHub Action" find nothing. A well-optimized Marketplace listing appears in VS Code autocomplete for `uses:`
3. **SEO: own "CLAUDE.md generator" and "AGENTS.md generator"** — zero-competition search terms right now. A web demo + 3 targeted blog posts would own the top of this funnel before competitors scale content
4. **Show HN: "I built a tool that auto-generates AI context files for every coding assistant"** — timed with public repo launch. Dev.to and r/LocalLLaMA follow-up sustains it
5. **Position as the automated way to create CLAUDE.md** — Anthropic's Claude Code docs tell developers to create this file manually. Submit a PR linking to hashmark as the community tool

**Retention hooks in place:**
- Staleness detection is a genuine pull-back mechanism — "14 commits stale" creates a reason to return
- Auto-scan on push (GitHub Action) keeps the tool embedded passively
- Mission board shows completed sessions

**Missing retention:**
- No email/notification when context goes stale
- No scan history trend view
- No team/multi-user use case

---

### Content Creator

**Score: 7/10 (content plan exists, execution pending)**

`docs/MARKETING.md` has a solid 6-post content plan. The channel is proven — the first blog post drove a 47% CLI-to-download conversion rate.

**Highest-leverage single action:** Publish the launch blog post ("Stop Maintaining 7 AI Context Files") simultaneously with `hashmark.md` going live. Everything else in the acquisition funnel depends on this.

**Priority content pieces:**
1. Launch post — "Stop Maintaining 7 AI Context Files" (Day 1)
2. "The Complete Guide to AI Context Files" (SEO foundation, no product required)
3. "The AGENTS.md Standard" — hashmark is uniquely positioned to write authoritatively on the 60K-repo adoption + Linux Foundation move
4. "I Scanned 100 Open Source Repos" — requires cloud data, post-launch week 1
5. GitHub Action Marketplace listing — distribution artifact with acquisition impact

---

### SEO

**Score: 1/10 (correct — this is a desktop app, not a web app)**

The marketing website is in a separate repo (`hashmark.md`) and is not present here. The SEO surface in this repo is intentionally minimal.

**Two fixes worth doing in this repo:**
1. Fix the orphaned `public/robots.txt` — it references `https://hashmark.md/sitemap.xml` which doesn't exist. A robots.txt pointing to a 404 sitemap is worse than no sitemap declaration
2. Audit `packages/cli/package.json` for `description`, `keywords`, and `homepage` fields — npm search is the actual SEO surface for CLI acquisition

---

## AI Engineering

**Score: 7/10**

**What's built:**
- Multi-CLI provider detection — Claude, Codex (o3), Gemini, Amp, Aider, Goose. Smart tool-agnostic positioning that no competitor has
- Per-session context analytics — tracks which CLAUDE.md sections are actually referenced during agent work
- Plan/build mode toggle with explicit approval flow
- Worktree isolation per run — clean state for each agent execution
- MCP bridge for connecting external tool servers
- Governance + action log — the audit trail for enterprise teams

**Architecture of AI execution:**
Claude/Codex/Gemini processes are spawned as subprocesses with `--print` or `--stream-json` flags. SSE streaming from subprocess stdout → Hono → EventSource in client. The `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1"` env var is passed to every subprocess.

**Gaps:**
- No timeout on spawned AI processes (see SRE section)
- Governance policies exist in DB but have **no enforcement hook** — they're descriptive, not active constraints on agent behavior
- ContextPanel shows 4 hardcoded fake agents ("scanner", "reviewer", "guard", "fixer") instead of real running sessions

**Biggest quick win:** Replace ContextPanel's hardcoded fake data with live data from `/api/sessions`, `/api/agents/effectiveness`, and `/api/info`. All the backend wires exist. This single change transforms the perception of the product from "a nice Claude client" to "an AI agent orchestration IDE." ~80 lines of fetch logic.

---

## Project Status

### Sprint Prioritizer — Recommended Next Sprint

| # | Item | Value | Effort | Status |
|---|------|-------|--------|--------|
| 1 | Fix `.gitignore` — add `dist/`, `client/dist/` | High | Low | Do first |
| 2 | E2E route smoke test — click every route, log broken ones | High | Low | Quick |
| 3 | Fix broken routes from smoke test | High | Medium | Blocker |
| 4 | Session restore reliability across restart | High | Low | Core loop |
| 5 | Add Generate + Run to Rail nav | High | Low | Navigation |
| 6 | Fix dispatch modal error state | High | Low | Core UX |
| 7 | Add `--surface` token to tokens.css | Low | Low | 2 lines |
| 8 | Consolidate toast systems | Medium | Low | Code quality |
| 9 | Add PR CI workflow | High | Low | Process |
| 10 | Tag current shell redesign as stable checkpoint | Medium | Low | Risk mitigation |

### Project Tracker

**Velocity:** High — the shell redesign is substantial (new rail, sessions panel, mission board, theme system, Tauri native layer, checkpoint system, memory canvas). Shipping fast.

**Risks:**
- `feature/shell-redesign` is 265+ commits ahead of main with no merge. Growing gap increases merge pain
- 80+ `studio/session/new-session-*` remote branches — auto-created by git integration during dev, pure noise
- Tauri vs Electron is undecided — both native layer targets exist in `package.json`, doubling maintenance surface
- `dist/` committed to git — every `git status` shows 200+ noise files, making real changes hard to see

**Recommended process improvements:**
- Lock the Void palette — 6 consecutive fix commits on Void theme in one day signals unresolved design decisions
- Cut a `studio/stable` tag from current state and stop growing the gap to main
- Run `git remote prune origin` + delete `studio/session/*` branches
- Decide: Electron or Tauri. Remove the other
- Run `npm run dist:clean` and add `dist/` to `.gitignore`

---

### Rapid Prototyper — 1-Day Wins

**Today:**
1. **ContextPanel live data** — replace 4 hardcoded fake agents with real sessions API. ~80 lines. Biggest demo impact of anything on this list
2. **Add Generate + Run to Rail** — 2 items, ~15 lines. Unblocks navigation for all users
3. **Fix `--surface` token + dispatch error state** — 10 lines total. Fixes two visible bugs

**This weekend:**
1. **Session search via FTS5** — SQLite FTS5 is bundled, the pattern exists in the CLI's BM25. Cross-session search is a killer recall feature
2. **`hashmark-scan.yml` fix + PR CI workflow** — 30 minutes of CI work that prevents regressions
3. **Starter agent bundle** — ship 5 default agent definitions so Run and Swarm work on first install

---

## Summary Scorecard

| Category | Score | Trend |
|----------|-------|-------|
| **Security** | 3/10 | 🔴 Needs immediate attention |
| **Testing** | 1/10 | 🔴 Near-zero coverage |
| **Legal** | 3/10 | 🔴 Before launch |
| **Analytics** | 3/10 | 🔴 Broken stat collection |
| **Backend** | 5/10 | 🟡 Good architecture, auth missing |
| **Database** | 5/10 | 🟡 Missing indexes, duplicate tables |
| **DevOps** | 5/10 | 🟡 No PR CI |
| **Reliability** | 5/10 | 🟡 No process timeouts |
| **UX** | 5/10 | 🟡 Core feature hidden |
| **Performance** | 5/10 | 🟡 Shiki bundle, N+1 diffs |
| **Frontend** | 6/10 | 🟢 Solid, token gaps |
| **Product** | 6/10 | 🟢 Strong features, navigation gaps |
| **UI Design** | 6/10 | 🟢 Good system, light mode holes |
| **Brand** | 6/10 | 🟢 Mission/session split |
| **AI Engineering** | 7/10 | 🟢 Ahead of curve |
| **Content** | 7/10 | 🟢 Plan exists, needs execution |
| **Growth** | 6/10 | 🟢 Badge virality ready to activate |

---

*Report generated by running 22 agents in parallel against the hashmark codebase at /Users/jasonpoindexter/Documents/GitHub/_active/hashmark on feature/shell-redesign.*
