# Hashmark Studio Full Audit Report
**Date: 2026-04-01 | Branch: feature/shell-redesign**
**15 agents, 580+ tool uses, ~45 minutes total analysis**

---

## Executive Summary

| Area | Agent | Score | P0 | P1 | P2 |
|------|-------|-------|-----|-----|-----|
| Security | Security Reviewer | 6/10 | 2 FIXED | 5 (3 FIXED) | 6 |
| Code Quality | Code Reviewer | 6/10 | 2 FIXED | 5 | 6 |
| UX | UX Auditor | 5.3/10 | 2 | 5 | 8 |
| Architecture | Backend Architect | 5/10 | 3 (2 FIXED) | 6 | 7 |
| Frontend | Frontend Dev | 6/10 | 2 (1 FIXED) | 5 | 11 |
| Database | Database Architect | 6/10 | 3 | 12 | 8 |
| Visual Design | Design Systems | 4/10 | 2 | 9 | 14 |
| Product | Product Manager | 5/10 | 1 | 5 | 10 |
| Reliability | SRE | 5/10 | 4 (2 FIXED) | 8 | 7 |
| AI Integration | AI Engineer | 6/10 | 1 FIXED | 4 | 8 |
| Legal | Compliance | 5/10 | 1 | 3 | 4 |
| Performance | Benchmarker | 7/10 | 1 | 3 | 5 |
| DevOps | DevOps | 4/10 | 4 | 7 | 4 |
| Growth | Growth Hacker | 5/10 | 1 | 4 | 5 |
| Studio Arch | Studio Architect | 6/10 | 1 | 3 | 4 |
| **TOTAL** | **15 agents** | **5.4/10** | **29** | **84** | **107** |

**Already fixed this session: 12 issues** (2 CRITICAL security, 3 HIGH security, 7 P0/P1 code/arch)

---

## ALREADY FIXED (12 issues)

| ID | What | Commit |
|----|------|--------|
| SEC-CRIT-1 | WebSocket terminal auth | aa6fec4 |
| SEC-CRIT-2 | Company prompt in CLI args | aa6fec4 |
| SEC-HIGH-1 | CSP connect-src too broad | aa6fec4 |
| SEC-HIGH-2 | providers.json world-readable | aa6fec4 |
| SEC-HIGH-3 | Checkpoint ref validation | aa6fec4 |
| CODE-P0-1 | activeRun not reset on timeout | ab3b38f |
| CODE-P0-2 | Swarm rate-limit hangs Promise | ab3b38f |
| ARCH-P0-1 | No SIGTERM shutdown handler | ab3b38f |
| ARCH-P0-2 | Stuck DB records on crash recovery | ab3b38f |
| ARCH-P0-3 | Worktree cleanup missing prefix | ab3b38f |
| UX-P0-1 | Run page ?agent= deep link broken | ab3b38f |
| FE-P0-1 | Sessions.tsx bare fetch() no auth | ab3b38f |

---

## REMAINING P0 -- Must Fix Before Launch (17 issues)

### Database
1. **Missing `busy_timeout` PRAGMA** -- concurrent writes throw SQLITE_BUSY instantly (db.ts:27)
2. **Missing index on `runs.issue_id`** -- full table scan on every issues JOIN
3. **`swarm_workers.output` loaded in full for effectiveness query** -- megabytes per row (agents.ts:338)

### DevOps
4. **dist/ tracked in git** -- 402 build artifacts (34MB) committed, polluting every diff
5. **No Tauri build CI workflow** -- desktop app can't be built/released automatically
6. **No auto-updater** -- users have no update path after install
7. **CI `lint` script doesn't exist** -- workflow references nonexistent npm script

### Product
8. **6 major features hidden from navigation** -- Swarm, Company, Git, Files, History, Governance unreachable from Rail

### Visual Design
9. **Light mode contrast failure on accent buttons** -- #000 text on #1a1a1a background = invisible (Home.tsx:136,354,565,629)
10. **Git.tsx string concat colors** -- `${color}18` produces invalid CSS

### Reliability
11. **swarms Map grows forever** -- no eviction, unbounded memory leak
12. **taskStore grows forever** -- no delete/eviction, permanent memory retention
13. **Empty catch blocks everywhere** -- 50+ silent error swallows, zero debug visibility
14. **No unhandledRejection handler** -- Node 24 crashes on missed await

### Legal
15. **Anthropic ToS grey area** -- programmatic CLI spawning may violate consumer subscription terms
16. **No data retention policy** -- sessions/messages stored indefinitely with no cleanup

### Growth
17. **No first-run onboarding** -- new users see empty folder picker with no explanation

---

## REMAINING P1 -- Should Fix Soon (72 issues)

### Security (2)
- No Zod validation on company routes (company.ts:100,157)
- All .env vars passed to Claude subprocess including secrets (sessions.ts:581)

### Database (12)
- Duplicate completed_at/ended_at on swarm_runs and swarm_workers
- FTS5 no DELETE trigger -- orphan search results
- Migrations not transactional -- partial crash leaves corrupt schema
- schema_migrations table is dead code
- Unbounded SELECT on sessions list (no LIMIT)
- N+1 pattern in tokens endpoint (6 correlated subqueries)
- Full content load for stage breakdown (loads all message bodies)
- Non-atomic workspace activation (2 UPDATE without transaction)
- Non-atomic swarm run + worker inserts
- company.ts writes output on every stdout chunk (WAL churn)
- Missing indexes on swarm_workers.agent_id, session_messages.sent_at, agent_actions.outcome
- sessions.model defaults to empty string instead of model name

### Architecture (6)
- Swarm SSE listeners never removed (listener leak)
- Company auto-merges without user approval (violates CLAUDE.md)
- Run.ts single-proc tracking (should be Map keyed by runId)
- Company has no cancel mechanism
- 3x duplicated loadAgents() function
- sessions.ts at 907 lines (extract chat handler)

### Code Quality (5)
- Company activeRun race condition (async check+set)
- Non-atomic rate-limit check in swarm batch
- Checkpoints POST uncaught throws
- Legacy checkpoint restore checkout on working tree
- DB singleton diverges on workspace switch

### Frontend (5)
- Swarm EventSource never cleaned on unmount (memory leak)
- Electron references remain in 5+ files
- z-index chaos (40+ values, no scale)
- Stale closure in Generate.tsx triggerScan
- Stale runStatus closure in Agents.tsx streaming

### AI Integration (4)
- Sessions chat doesn't use shared stream parser (missing events)
- runner.ts doesn't parse stream-json at all
- Stream parser flush() never called (final event lost)
- Company workers ignore per-agent tool scoping

### UX (5)
- Agent CRUD silently swallows all errors (no toast feedback)
- Dual toast systems (toast() singleton vs studio:toast event)
- Home has no loading state (flash of empty content)
- No focus trap on modals
- Board-to-chat toggle uses state not URL routing (back button broken)

### Visual Design (9)
- 40+ hardcoded color values bypass token system
- Zero spacing tokens (every margin/padding is raw pixels)
- Font size tokens exist but never used in components
- DEPT_COLORS duplicated 3 times
- Model lists duplicated 4 times with different entries
- Toggle component duplicated with different implementations
- No --color-on-accent token
- No z-index token scale
- Mixed icon systems (Lucide + custom SVG + Unicode + emoji)

### DevOps (7)
- tauri:build skips server build
- No code signing configured
- No version bump automation
- 5 npm vulnerabilities (1 high, 4 moderate)
- No Node.js version pinned (.nvmrc / engines)
- macOS-only platform support with targets: "all"
- No documented first-run path for packaged Tauri app

### Product (5)
- Company.tsx line 542 bare fetch() without auth
- WorkspaceSetup drag-and-drop broken on Tauri (Electron file.path API)
- Terminology overload (missions vs tasks vs runs vs sessions)
- 6 dead shell components (ActivityBar, AgentDetailViewer, etc.)
- No SSE reconnection logic

### Growth (4)
- No Claude binary pre-flight check at startup
- No usage dashboard / analytics instrumentation
- No attribution in generated files
- No desktop notifications for completed runs

### Reliability (8)
- Swarm SSE listener leak (dead closures accumulate)
- run.ts activeProc zombie reference race
- No periodic worktree orphan cleanup
- No DB backup mechanism
- agent-actions.jsonl grows without bound (no rotation)
- Health check too shallow (no disk, memory, active process checks)
- No structured logging (1 console.log in entire server)
- Session history grows unbounded (no truncation for non-resume turns)

---

## REMAINING P2 (107 issues)

Too many to list individually. Grouped by category:

| Category | Count | Examples |
|----------|-------|---------|
| Visual Design | 14 | No elevation system, no easing tokens, no type role classes, identical --font/--font-ui tokens |
| Frontend | 11 | renderInline duplicated 3x, inline styles recreated every render, missing aria-labels, dead void_ code |
| Product | 10 | No Cmd+K discoverability, Settings too large (13 sections), no responsive design, PageSkeleton is blank div |
| Architecture | 7 | SSE heartbeat missing, DB errors swallowed, stream parser flush, duplicate columns |
| Database | 8 | Missing CHECK constraints, dead schema_migrations, SELECT * on large output columns |
| UX | 8 | Light mode badge colors, SPA link bug in Git.tsx, inconsistent loading states |
| Reliability | 7 | WAL file growth, sandbox no eviction, pendingAnalytics leak |
| AI Integration | 8 | No prompt caching on API path, token estimation inconsistent, Codex full-auto bypasses safety |
| DevOps | 4 | Duplicate build scripts, stale tsconfig electron reference, @types/ws in wrong deps |
| Performance | 5 | Font @import blocks render, no virtual scrolling on large outputs |
| Growth | 5 | No upgrade path placeholder, no viral mechanics, terminology needs simplification |
| Legal | 4 | EULA needs lawyer review, no accessibility compliance, data retention unclear |

---

## LAUNCH READINESS SCORES BY AGENT

| Agent | Score | Verdict |
|-------|-------|---------|
| Growth Hacker | 5/10 | "Need onboarding, analytics, pre-flight checks" |
| Product Manager | 5/10 | "6 hidden features, naming confusion, dead code" |
| Visual Design | 4/10 | "40+ hardcoded colors, no spacing system, contrast failures" |
| DevOps | 4/10 | "No CI for desktop builds, no signing, no updater" |
| SRE | 5/10 | "Memory leaks, no logging, empty catches everywhere" |
| UX Auditor | 5.3/10 | "Hidden nav, broken deep links, silent errors" |
| **Overall** | **5.4/10** | **Not ready for public launch. Early access OK with P0 fixes.** |

---

## TOP 20 FIXES BY IMPACT/EFFORT

| # | Effort | Issue | Impact |
|---|--------|-------|--------|
| 1 | 2 min | Add `busy_timeout = 5000` PRAGMA to db.ts | Prevents all SQLITE_BUSY crashes |
| 2 | 5 min | Remove dist/ from git tracking | -34MB repo, clean diffs |
| 3 | 5 min | Fix npm audit vulnerabilities | Eliminates 5 security advisories |
| 4 | 5 min | Add unhandledRejection handler to bin.ts | Prevents silent Node crashes |
| 5 | 10 min | Add Swarm, Company, Git, History to Rail nav | Unlocks 6 hidden features |
| 6 | 10 min | Fix light mode accent button contrast | Prevents invisible buttons |
| 7 | 10 min | Add swarm/taskStore eviction on completion | Fixes 2 memory leaks |
| 8 | 15 min | Add toast feedback to agent CRUD | Fixes silent error swallowing |
| 9 | 15 min | Add loading skeleton to Home page | Fixes flash of empty content |
| 10 | 15 min | Add console.error to top 20 catch blocks | Basic debug visibility |
| 11 | 15 min | Fix Company.tsx bare fetch + auth | Prevents auth bypass |
| 12 | 15 min | Add missing DB indexes (4) | Fixes slow queries |
| 13 | 20 min | Use shared stream parser in sessions.ts | Captures rate_limit, tool_progress events |
| 14 | 20 min | Extract loadAgents to shared module | Removes 3x code duplication |
| 15 | 20 min | Fix CI lint script + add tauri:build server step | Working CI pipeline |
| 16 | 30 min | Extract spacing tokens + apply to top 5 pages | Consistent spacing system |
| 17 | 30 min | Add first-run welcome screen | New user onboarding |
| 18 | 30 min | Add --color-on-accent token + fix all accent buttons | Theme-safe contrast |
| 19 | 45 min | Add Tauri desktop build CI workflow | Automated releases |
| 20 | 60 min | Add code signing + auto-updater | Required for distribution |

**Total for top 10: ~82 minutes. Top 20: ~6 hours.**
