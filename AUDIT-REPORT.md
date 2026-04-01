# Hashmark Studio Full Audit Report
**Date: 2026-04-01 | Branch: feature/shell-redesign**
**5 agents, 234 tool uses, ~19 minutes total analysis**

---

## Executive Summary

| Area | Score | Critical | High | Medium | Low |
|------|-------|----------|------|--------|-----|
| Security | 6/10 | 2 (FIXED) | 5 (3 FIXED) | 6 | 4 |
| Code Quality | 6/10 | 0 | 5 | 6 | 0 |
| UX | 5.3/10 | 2 | 5 | 8 | 5 |
| Architecture | 5/10 | 3 | 6 | 7 | 0 |
| Frontend | 6/10 | 2 | 5 | 11 | 10 |
| **Total** | **5.7/10** | **9** | **26** | **38** | **19** |

**Already fixed this session:** 2 CRITICAL + 3 HIGH security issues.

---

## P0 -- Must Fix Before Launch

### SEC-1 [FIXED] WebSocket terminal had no auth
`server/routes/terminal.ts:152` -- Any local process could get a full shell. Fixed: token validation on upgrade.

### SEC-2 [FIXED] Company plan prompt exposed in process listing
`server/routes/company.ts:129` -- Switched to stdin delivery.

### ARCH-1 No shutdown signal handler
`bin.ts:34` -- No `process.on('SIGTERM')`. On close: all Claude processes orphaned, sessions stuck at "streaming", worktrees leak, rate limits reset.
**Fix:** Wire SIGTERM/SIGINT to kill all active processes + mark DB records as crashed.

### ARCH-2 No global concurrency limiter
11+ concurrent Claude processes possible (1 run + 3 swarm + 2 company + 5 sessions). CLAUDE.md says max 2.
**Fix:** Shared semaphore in `claude-usage.ts` that all spawn points acquire.

### ARCH-3 In-memory state not recoverable on restart
`activeRun`, `activeProc`, `swarms` Map, `sessionLastActivity` all lost. DB shows "running" forever.
**Fix:** Startup recovery marks all running/streaming records as crashed.

### CODE-1 activeRun not reset on timeout
`run.ts:296` -- Timeout kills process but never sets `activeRun = false`. Permanently blocks future runs.
**Fix:** Reset activeRun + activeProc in timeout handler.

### CODE-2 Swarm rate-limit denial hangs Promise forever
`swarm.ts:200` -- Returns without calling `resolve()`. Agent hangs, swarm never completes.
**Fix:** Call `resolve()` before return.

### UX-1 9 pages hidden -- only 5 in Rail nav
`Rail.tsx:122` -- /git, /swarm, /company, /history, /governance unreachable without command palette.
**Fix:** Add at least Swarm and History to Rail.

### UX-2 Agent run deep link broken
`Run.tsx:119` -- Clicking "Run" from Agents page passes `?agent=id` but Run.tsx never reads it.
**Fix:** Parse URLSearchParams on mount.

---

## P1 -- Should Fix Soon

### SEC-3 [FIXED] CSP connect-src was too broad
Locked WebSocket to localhost:port only.

### SEC-4 [FIXED] providers.json API keys world-readable
Now written with mode 0o600.

### SEC-5 [FIXED] Legacy checkpoint restore accepted arbitrary git refs
Now validates hex hash or studio-checkpoint prefix.

### SEC-6 No Zod validation on company routes
`company.ts:100,157` -- Raw `c.req.json()` with no schema. No max length on task text.

### SEC-7 API keys passed as env vars to Claude subprocess
`sessions.ts:581` -- All .env vars (DATABASE_URL, STRIPE_SECRET_KEY, etc.) passed to Claude.

### CODE-3 Company activeRun race condition
`company.ts:80-165` -- Two simultaneous POSTs both pass the `activeRun` check. Flag set async.

### CODE-4 Non-atomic rate-limit check in swarm batch
`swarm.ts:199-207` -- 3 agents all check before any records. Can exceed hourly budget.

### CODE-5 Checkpoints POST uncaught throws
`checkpoints.ts:158-174` -- `git write-tree` and `git commit-tree` not wrapped in try/catch.

### CODE-6 DB singleton diverges on workspace switch
`db.ts:10-30` -- In-flight streams capture old DB ref. New getDb() calls point to new project.

### ARCH-4 FTS orphan rows
No DELETE trigger on sessions_fts. Deleted sessions leave phantom search results.

### ARCH-5 Swarm SSE listeners never removed
`swarm.ts:482` -- Dead listeners accumulate. Each reconnect adds another.

### ARCH-6 Swarm Map never pruned
Module-level Map grows without bound. Completed swarms retained forever.

### ARCH-7 Company auto-merges without user approval
`company.ts:387` -- Violates CLAUDE.md "never auto-merge" rule.

### ARCH-8 Startup worktree cleanup misses `studio-swarm-` prefix
`index.ts:273` -- Company worktrees with `studio-swarm-` pattern not matched.

### FE-1 Raw fetch() bypasses auth
`Sessions.tsx:286` -- Uses bare `fetch()` instead of `fetchApi()`.

### FE-2 Swarm EventSource never cleaned up on unmount
`Swarm.tsx:62-138` -- Memory leak, setState on unmounted component.

### FE-3 Electron references remain
`main.tsx:32`, `ProjectPicker.tsx`, `AboutDialog.tsx`, `Settings.tsx:1194` -- Should be Tauri.

### FE-4 z-index chaos
40+ locations, no scale. Toasts (9999) hidden behind dialogs (10000).

### UX-3 Agent CRUD silently swallows all errors
`Agents.tsx:166-316` -- Create/delete/save/duplicate have empty catch blocks. No toast feedback.

### UX-4 Dual toast systems
Some files use `toast()` singleton, others fire `studio:toast` CustomEvent.

### UX-5 Home has no loading state
`Home.tsx:470` -- Renders empty state immediately before fetch resolves. Flash of wrong content.

### UX-6 No focus trap on modals
`Home.tsx:223`, `Agents.tsx:1119` -- Tab key escapes modal overlay.

---

## P2 -- Nice to Have

### Architecture
- `loadAgents()` duplicated in 3 files -- extract to `server/lib/agents.ts`
- `sessions.ts` at 907 lines -- extract chat handler, analytics, search
- Stream parser `flush()` never called -- last event may be lost
- DB errors silently swallowed everywhere -- add console.error minimum
- Duplicate `completed_at`/`ended_at` columns on swarm tables
- Missing SSE heartbeat on run/company streams
- Missing DB indexes on `runs.issue_id` and `runs.status`
- Migration has no transaction wrapping -- partial crash leaves corrupt schema

### Code Quality
- `isDismissed` called as value not function in Shell.tsx:72
- Stale closure in Generate.tsx triggerScan
- Stale runStatus closure in Agents.tsx streaming loop
- `workspace.ts` splits command on whitespace -- breaks paths with spaces

### Frontend
- `renderInline` duplicated in 3 files
- MODELS constant duplicated in 4 files (with inconsistent entries)
- Inline style objects recreated every render (GC pressure)
- Missing aria-labels on icon-only buttons
- Dead code: `void_ = config` pattern in Generate.tsx
- `handleRunAgain` uses double-nested setTimeout(0)
- Agents.tsx at 1600 lines -- should be 4-5 components
- useProjectInfo polls without AbortController
- `@import url(...)` for Google Fonts blocks render
- Eager session creation on mount even for non-chat pages

### UX
- Light mode badge borders use hardcoded saturated colors
- SPA link `<a href="/source-control">` causes full reload in Git.tsx
- Board-to-chat toggle uses state not URL routing (back button broken)
- "audit" and "review" buttons do identical thing on mission cards
- Loading state inconsistent (Agents shows "Loading..." text, others use skeletons)
- Page headers inconsistent (font sizes, weights, tags vary)
- No Rail tooltips -- new users must click to discover pages
- Dept/branch colors hardcoded, don't adapt to light theme

---

## Top 10 Fixes by Impact/Effort Ratio

| Rank | ID | Effort | Description |
|------|----|--------|-------------|
| 1 | CODE-2 | 1 min | Add `resolve()` before return in swarm rate-limit denial |
| 2 | CODE-1 | 1 min | Reset activeRun in timeout handler |
| 3 | UX-2 | 5 min | Parse ?agent= query param in Run.tsx |
| 4 | FE-1 | 1 min | Replace fetch() with fetchApi() in Sessions.tsx |
| 5 | ARCH-1 | 15 min | Add SIGTERM handler to bin.ts |
| 6 | UX-3 | 15 min | Add toast feedback to agent CRUD operations |
| 7 | UX-5 | 10 min | Add loading skeleton to Home page |
| 8 | ARCH-2 | 20 min | Global concurrency semaphore |
| 9 | SEC-6 | 10 min | Add Zod schemas to company routes |
| 10 | ARCH-3 | 10 min | Startup recovery for stuck DB records |

**Total for top 10: ~88 minutes of work to fix the worst issues.**
