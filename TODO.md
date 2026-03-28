# hashmark — Fix Plan & TODO
> Derived from AGENT_COMPANY_REPORT.md · 2026-03-28

Model key: `[sonnet]` = Claude Sonnet 4.6 · `[opus]` = Claude Opus 4.6

---

## Phase 1 — Critical (Security + Stability)
> Must fix before any wider distribution

- [x] **[opus]** Add localhost auth token to Hono server — generate random token on start, store in `.hashmark/studio.token`, require `Authorization: Bearer` on all state-mutating routes (`server/index.ts`, all routes in `server/routes/`)
- [x] **[sonnet]** Fix CORS — replace `cors({ origin: "*" })` with `origin: "http://localhost:3200"` in `server/index.ts`
- [x] **[sonnet]** Fix shell injection in `server/lib/providers.ts:85` — replace `execSync` template string with `spawnSync` + explicit args array
- [x] **[sonnet]** Fix governance route wrong directory — `governanceRoutes(opts.projectDir)` → `governanceRoutes(ctx.dataDir)` in `server/index.ts:156`
- [x] **[opus]** Fix duplicate swarm tables — merge `swarm_workers` and `swarm_agents` into one schema with proper FK relationships, add migration versioning (`server/db.ts`, `server/routes/swarm.ts`)
- [x] **[sonnet]** Fix `activeRun` race condition — atomically set flag before `await`, use a mutex or set flag synchronously before the async call
- [x] **[sonnet]** Fix DELETE `/api/run` — actually kill the running child process on cancel, don't just set `activeRun = false`
- [x] **[sonnet]** Add process timeout for spawned AI agents — 10-minute `setTimeout` sends SIGTERM to prevent indefinite hung sessions
- [x] **[sonnet]** Validate workspace paths — reject paths outside of user home dir in workspace route to prevent `~/.ssh` redirect attack
- [x] **[sonnet]** Add security headers — `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` on all Hono responses
- [x] **[sonnet]** Add rate limiting on chat and run routes — Hono middleware, 10 req/min per route

---

## Phase 2 — Core UX Blockers
> Fix before showing to anyone new

- [x] **[sonnet]** Add Generate + Run to Rail navigation — currently hidden routes, 2 entries ~15 lines in `Shell.tsx` or Rail component
- [x] **[sonnet]** Fix dispatch modal error state — show error message when `POST /api/sessions` fails instead of silently closing
- [x] **[sonnet]** Fix WorkspaceSetup MCP poll timeout — `setInterval` in Step 3 runs indefinitely; add a 60s timeout with clear error message (`client/src/pages/WorkspaceSetup.tsx`)
- [x] **[sonnet]** Fix blank initial load — add skeleton or logo during `configured === null` state in `AppShell`
- [x] **[sonnet]** Wire ContextPanel to live data — replace 4 hardcoded fake agents ("scanner", "reviewer", "guard", "fixer") with real data from `/api/sessions` + `/api/agents/effectiveness` + `/api/info` (~80 lines)
- [x] **[sonnet]** Add Agents page empty state — show helpful empty state when `agents.length === 0`
- [x] **[sonnet]** Show output file path after Generate scan completes
- [x] **[sonnet]** Add app-level error boundary — wrap `AppShell` in `<ErrorBoundary>` in `App.tsx`
- [x] **[sonnet]** Fix "attach codebase context" toggle — currently non-functional; wire to actual context injection

---

## Phase 3 — DevOps & Process
> Fix before merging to main

- [x] **[sonnet]** Add `dist/` and `client/dist/` to `.gitignore` — cleans up 200+ noise files from every `git status`
- [x] **[sonnet]** Add `.github/workflows/ci.yml` — triggered on `pull_request`, runs lint + typecheck + test
- [x] **[sonnet]** Add `.env.example` — document all required environment variables for new contributors
- [x] **[sonnet]** Fix `hashmark-scan.yml` — replace `npm install -g hashmark` with `npm install -g .` to use repo version, not published
- [x] **[sonnet]** Add `"prepare": "husky"` to root `package.json` for automatic hook setup
- [x] **[sonnet]** Cut `studio/stable` tag from current shell redesign state — stop growing the gap to main (265+ commits)
- [x] **[sonnet]** Clean up `studio/session/*` remote branches — run `git remote prune origin` + bulk delete noise branches
- [x] **[sonnet]** Decide: Electron or Tauri — remove the unused target from `package.json` and native layer

---

## Phase 4 — Database
> Fix before load increases

- [x] **[sonnet]** Add 5 missing indexes to `server/db.ts`:
  - `idx_sessions_archived_updated ON sessions(archived, updated_at DESC)`
  - `idx_sessions_updated ON sessions(updated_at DESC)`
  - `idx_agent_actions_created ON agent_actions(created_at DESC)`
  - `idx_agent_actions_agent ON agent_actions(agent_id)`
  - `idx_runs_started ON runs(started_at DESC)`
- [x] **[sonnet]** Add `schema_version` table and migration tracking — no way to know which migrations have run
- [x] **[sonnet]** Move inline migrations out of route handlers — `runs` columns added in `run.ts:100-103` should be in `migrate()` in `db.ts`
- [x] **[sonnet]** Add FTS5 virtual table for session search — replace `LIKE '%query%'` full table scan
- [x] **[sonnet]** Fix N+1 in checkpoint listing — replace per-checkpoint git invocations with single `git log` call (`server/routes/checkpoints.ts:38-96`)
- [x] **[sonnet]** Add pagination to `GET /api/sessions/:id` messages — no LIMIT means 1MB+ for long sessions
- [x] **[opus]** Pass DB instance through `WorkspaceCtx` instead of module-level singleton — prevents stale DB reference after workspace switch

---

## Phase 5 — Analytics (Broken Data)

- [x] **[sonnet]** Fix swarm stats — write `merged_count`, `conflict_count`, `skipped_count` to `swarm_runs` during execution (currently always 0)
- [x] **[sonnet]** Fix token counting — parse `usage` field from `--output-format stream-json` response instead of `Math.ceil(length / 4)`
- [x] **[sonnet]** Fix model persistence — save actual model name from `body.model` to `sessions.model` column (currently hardcoded as `'claude'`)
- [x] **[sonnet]** Add session duration tracking — add `started_at` + `ended_at` + `error_count` columns to sessions table
- [x] **[sonnet]** Add `GET /api/analytics/summary` endpoint — aggregate view for the app
- [x] **[sonnet]** Fix context analytics write frequency — debounce disk writes to flush on stream completion, not every chunk

---

## Phase 6 — Frontend Code Quality

- [x] **[sonnet]** Add `--surface: var(--bg-2)` and `--surface-2` to `tokens.css` — 2-line fix, unbreaks Home.tsx mission cards
- [x] **[sonnet]** Consolidate toast systems — remove inline toast array from `Shell.tsx` (lines 92, 480-496), route everything through `Toasts.tsx` event bus
- [x] **[sonnet]** Add `useFocusTrap` hook and apply to all modals — `ConfirmDialog`, `CommandPalette`, `ShortcutsHelp`, `AboutDialog`
- [x] **[sonnet]** Fix accessibility on interactive divs — add `role="button"`, `tabIndex={0}`, `onKeyDown` to `SessionsPanel` rows and any other `<div onClick>`
- [x] **[sonnet]** Wire XTerminal colors to CSS variables — currently hardcoded VS Code dark (`#1e1e1e`, `#cccccc`) in `client/src/components/XTerminal.tsx`
- [x] **[sonnet]** Replace `useState(hovered)` with CSS `:hover` — 22+ components triggering re-renders on every mouse move
- [x] **[opus]** Decompose `Shell.tsx` (499 lines) — extract `useSessionManager`, `useStreamingSession`, `useStudioEvents` hooks
- [x] **[sonnet]** Extract `findClaudeBin` to `server/lib/bin-resolver.ts` — currently duplicated across `runner.ts`, `run.ts`, `swarm.ts`, `sessions.ts` with inconsistent candidate lists
- [x] **[sonnet]** Add Zod validation on top 5 routes — chat, run, swarm, session create, workspace switch
- [x] **[sonnet]** Fix `Skeleton.tsx` and `PageTransition.tsx` — remove direct DOM `<style>` injection, use CSS class or `styled-jsx`

---

## Phase 7 — Performance

- [x] **[sonnet]** Restrict Shiki to used languages only — replace all-languages import with `createHighlighter({ langs: ['typescript', 'python', 'bash', 'json', 'css', 'html', 'markdown', 'yaml', 'go', 'rust', 'shell', 'diff', 'plaintext'] })`. Cuts 6.5MB bundle
- [x] **[sonnet]** Fix N+1 git diff in Git panel — replace `Promise.all(files.map(f => execAsync("git diff --numstat " + f)))` with single `git diff --numstat HEAD`
- [x] **[sonnet]** Cache CLAUDE.md in memory — currently read from disk 2x per chat turn; watch for changes with `fs.watch`
- [x] **[sonnet]** Add `document.visibilitychange` guard to polling intervals — `Home.tsx` and `Company.tsx` `setInterval(8000)` should pause when tab is hidden
- [x] **[sonnet]** Add `React.memo` to `AssistantContent` — re-renders on every streaming chunk; batch `setStreamText` to fire at most every 50ms

---

## Phase 8 — Reliability (SRE)

- [x] **[sonnet]** Fix orphaned worktree cleanup — clean up `studio-run-*` and `swarm-*` dirs in `/tmp` on server start
- [x] **[sonnet]** Fix `activeRun` leak on crash — add `try/finally` to reset flag even if run throws
- [x] **[sonnet]** Upgrade health check — verify DB write access and claude binary exists, not just `{ ok: true }`
- [x] **[sonnet]** Add Hono `logger()` middleware — 3 lines, gives baseline audit trail of all route calls
- [x] **[sonnet]** Add size guard to action log reader — `governance.ts:107` reads entire file with `readFileSync` with no limit; block event loop on large projects

---

## Phase 9 — Testing

- [x] **[sonnet]** Fix root `vitest.config.ts` — targets `src/**` which doesn't exist; fix glob to match actual source structure (5-minute fix, unlocks all tests)
- [x] **[sonnet]** Fix `packages/cli/vitest.config.ts` — remove stray `import { Button }` that throws at config load time
- [x] **[sonnet]** Move Playwright specs out of `.hashmark/snapshots/` — add `playwright.config.ts` and `test:e2e` script
- [x] **[sonnet]** Write auth token flow tests — highest blast radius, 0% coverage
- [x] **[sonnet]** Write session create + chat route tests — core user action, 0% coverage
- [x] **[sonnet]** Write `secrets.ts` scanner tests — false negatives are a security issue, 0% coverage
- [x] **[sonnet]** Write `generator.ts` output tests — primary CLI deliverable, 0% coverage
- [x] **[sonnet]** Remove `waitForTimeout` from Playwright specs — replace with `waitForSelector` / `waitForResponse`

---

## Phase 10 — UI Design & Brand

- [x] **[sonnet]** Fix light mode: `StatusBar.tsx:53` — `color: "rgba(0,0,0,0.8)"` on dark accent; add `--overlay-bg` token and replace all 6 modal backdrops using hardcoded `rgba(0,0,0,0.5)`
- [x] **[sonnet]** Fix light mode: replace 15+ hardcoded `boxShadow: "0 Npx Mpx rgba(0,0,0,X)"` values with CSS variable shadows
- [x] **[sonnet]** Add `--orange` and `--purple` tokens to `tokens.css` — `ToolSummary.tsx` falls back to raw GitHub palette values
- [x] **[sonnet]** Replace `AVATAR_COLORS` rainbow table in `SessionsSidebar.tsx` — 52-entry rainbow contradicts the zero-hue Void system; replace with 3-4 grey variants
- [x] **[sonnet]** Replace `AGENT_COLORS` `#c084fc` raw purple in `SessionsPanel.tsx` with CSS variable
- [x] **[sonnet]** Fix `GitSidebar.tsx` status colors — replace GitHub palette (`#cca700`, `#2ea043`, `#f85149`, `#58a6ff`) with muted Void equivalents via tokens
- [x] **[sonnet]** Add font size scale tokens — replace hardcoded `10`, `11`, `12`, `13` px values with `--font-size-xs`, `--font-size-sm`, etc.
- [x] **[sonnet]** Unify mission/session naming — audit all UI copy: use "mission" everywhere in the UI, keep `sessions` for internal API/DB. Files: `SessionsPanel.tsx`, `Sessions.tsx`, `DispatchModal.tsx`, `Home.tsx`
- [x] **[sonnet]** Standardize button casing — everything lowercase: `"Generate Context"` → `"generate context"`, `"Launch Swarm (3)"` → `"launch swarm (3)"` etc.

---

## Phase 11 — Legal

- [x] **[sonnet]** Write and publish Privacy Policy at `hashmark.md/privacy`
- [x] **[sonnet]** Write and publish Terms of Service at `hashmark.md/terms`
- [x] **[sonnet]** Add EULA to Electron/Tauri installer
- [x] **[sonnet]** Add one-line privacy disclosure to `hashmark login` CLI flow before OAuth redirect
- [x] **[sonnet]** Add `hashmark logout --delete-cloud-data` command for GDPR Article 17 (right to erasure)

---

## Phase 12 — Growth & SEO (non-code)

- [x] **[sonnet]** Fix `public/robots.txt` — remove or update reference to non-existent `https://hashmark.md/sitemap.xml`
- [x] **[sonnet]** Update `packages/cli/package.json` — add `description`, `keywords`, `homepage` for npm search visibility
- [x] Add hashmark badge to generated READMEs on first GitHub Action run — `[![hashmark synced](https://img.shields.io/badge/hashmark-synced-green)](https://hashmark.md)`
- [ ] Make GitHub repo public + submit to GitHub Marketplace
- [ ] Publish "Stop Maintaining 7 AI Context Files" launch post simultaneously with hashmark.md launch
- [ ] Publish "The Complete Guide to AI Context Files" (SEO foundation)
- [ ] Submit PR to Anthropic Claude Code docs linking hashmark as community CLAUDE.md tool

---

## Quick Wins (do these today)

1. `[sonnet]` `--surface` token → `tokens.css` (2 lines)
2. `[sonnet]` Dispatch modal error state (10 lines)
3. `[sonnet]` Add Generate + Run to Rail (15 lines)
4. `[sonnet]` ContextPanel live data (80 lines, biggest demo impact)
5. `[sonnet]` `dist/` to `.gitignore` (1 line)
6. `[sonnet]` Hono `logger()` middleware (3 lines)
7. `[sonnet]` Fix governance route directory (1 line)

---

## Item Count by Model

| Model | Count |
|-------|-------|
| Sonnet 4.6 | 72 |
| Opus 4.6 | 5 |
| **Total** | **77** |

Opus tasks: auth token architecture, swarm schema redesign, Shell.tsx decomposition, DB context passing, and the two other complex architectural items.
