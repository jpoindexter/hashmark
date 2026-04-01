# hashmark studio -- Master TODO
> Updated 2026-04-01 from 15-agent audit + Claude Code source analysis

---

## Phase 0 -- Code Cleanup (do first, before any features)

### God file decomposition
- [x] Split `Agents.tsx` (1972 lines) into: AgentList, AgentDetail, AgentEditor, AgentRunner, AgentGovernance
- [x] Split `sessions.ts` server route (907 lines) into: chat handler, search, analytics, token counting
- [x] Split `Settings.tsx` into section components (13 sections in one file)
- [x] Split `Home.tsx` dispatch modal into its own component

### Code deduplication
- [x] Extract `loadAgents()` to `server/lib/agents.ts` (currently copy-pasted in run.ts, swarm.ts, company.ts)
- [x] Extract MODELS constant to `client/src/lib/models.ts` (4 different lists in Home, Sessions, Agents, Shell)
- [x] Extract `renderInline()` to `client/src/lib/markdown.ts` (3 copies in Sessions, Agents, ChatMessages)
- [x] Extract Toggle component to `client/src/components/shared/Toggle.tsx` (2 different implementations in Settings, Governance)
- [x] Extract time formatting utils to `client/src/lib/format.ts` (5+ copies: timeAgo, fmtRelative, relativeTime, formatTs)
- [x] Extract DEPT_COLORS to shared constant (3 copies in Run, AgentCard, Agents)

### Dead code removal
- [x] Remove dead shell components: ActivityBar, AgentDetailViewer, ContextPanel, MissionBar, ModelBar, SidebarPanel, RightSidebar, SidebarResize
- [x] Remove Electron references from main.tsx, ProjectPicker, AboutDialog, Settings, WorkspaceSetup
- [x] Remove `void_ = config` dead code pattern in Generate.tsx
- [x] Remove duplicate `xterm` v5 package (keep only `@xterm/xterm` v6)
- [x] Remove `schema_migrations` table (created but never used)
- [x] Remove stale tsconfig `electron/**/*.ts` include

### Error handling
- [x] Add `console.error` to top 20 empty catch blocks blocks (run.ts, swarm.ts, company.ts, sessions.ts)
- [x] Standardize on `toast()` singleton -- remove all `studio:toast` CustomEvent dispatches
- [x] Add toast feedback to all Agents CRUD operations (create, delete, save, duplicate)
- [x] Add error state + retry to Home page fetches (currently .catch(() => {}))

### Type safety
- [x] Add Zod schemas to company plan + run routes (raw c.req.json() with no validation)
- [x] Fix `isDismissed` called as value not function in Shell.tsx:72
- [x] Fix stale closure in Generate.tsx triggerScan (wrap in useCallback)
- [x] Fix stale runStatus closure in Agents.tsx streaming loop (use ref)

---

## Phase 1 -- Critical Fixes (P0 from audit)

### Architecture
- [ ] Wire Tauri managed sidecar for Node server (clean lifecycle, no orphan processes)
- [x] Remove dist/ from git tracking: `git rm -r --cached dist/`
- [x] Add `process.on("uncaughtException")` handler to bin.ts
- [x] Fix mutable shared `ctx` concurrency hazard (workspace switch corrupts in-flight ops)
- [x] Fix company.ts `activeRun` race condition (async check+set, no mutex)

### Database
- [x] Wrap FTS5 creation + backfill in transaction (partial crash = empty FTS forever)
- [x] Add LIMIT to session list query (unbounded SELECT polled every 8s)
- [x] Rewrite tokens endpoint (6 correlated subqueries -> 1 JOIN aggregate)
- [x] Use LENGTH(output) instead of loading full output in effectiveness queries
- [x] Batch company.ts output DB writes (currently writes full output on every stdout chunk)

### DevOps
- [x] Add Tauri desktop build CI workflow (tauri-apps/tauri-action)
- [x] Fix tauri:build to include server build (currently skips it)
- [ ] Add code signing for macOS (Apple Developer ID)
- [ ] Add Tauri auto-updater (tauri-plugin-updater)
- [ ] Add version bump script (syncs package.json + Cargo.toml + tauri.conf.json)
- [x] Self-host JetBrains Mono font (currently @import blocks render, breaks offline)

### UX
- [x] Add Swarm, Company, Git, Files, History, Governance to Rail nav
- [x] Add first-run onboarding (welcome screen, Claude CLI check, sample task)
- [x] Add loading skeleton to Home page (flash of empty content on mount)
- [x] Add focus trap + Escape handler to DispatchModal and CreateAgent modal
- [x] Fix Git.tsx string concatenation (produces invalid CSS)

### Legal
- [ ] Add LICENSE file (recommend BSL for commercial + open source)
- [ ] Get written Anthropic approval for CLI spawning
- [ ] Have lawyer review PRIVACY.md, TERMS.md, EULA.md

---

## Phase 2 -- Features from Claude Code Source

### Retry + Backoff (server/lib/retry.ts)
- [x] Exponential backoff: 500ms base, 10 retries max, 3 for 529 overloaded
- [x] Fallback model support (try sonnet if opus fails)
- [ ] Heartbeat every 30s during retries (prevent client timeout)
- [x] Wire into all spawn sites (run, swarm, company, sessions)

### Microcompaction (server/lib/compaction.ts)
- [x] Truncate large tool results in session history (file reads, bash output)
- [ ] Trigger at 80% context window (AUTOCOMPACT_BUFFER_TOKENS = 13000)
- [x] Warning UI at 90% context (WARNING_THRESHOLD = 20000)
- [ ] Track context usage per session, expose via API

### Permission Cascade
- [x] 5 levels: default, acceptEdits, plan, auto, bypass
- [x] Settings UI to choose level per workspace
- [x] Map levels to --allowedTools + --permission-mode flags
- [x] Cycle shortcut in Run page (like Claude Code's Shift+Tab)

### Session Memory
- [ ] Periodic background updates to .session.md
- [ ] Cross-session learnings (if agent A discovers Prisma, agent B knows)
- [ ] Gate: every N turns, fork agent to extract learnings

### Dream Mode
- [ ] Background agent reviews past sessions every 24h
- [ ] 4-phase prompt: Orient, Gather, Consolidate, Prune
- [ ] Gates: >= 24h since last + >= 5 sessions + file lock
- [ ] Uses forked agent pattern (shares prompt cache)

### Cache Sharing for Swarm
- [ ] CacheSafeParams pattern from Claude Code
- [ ] Share system prompt + tools hash across sub-agents
- [ ] Expected 60-80% cost reduction on swarm runs

---

## Phase 3 -- UX Polish

### Visual design system
- [x] Add spacing tokens (--space-1 through --space-8 on 4px grid)
- [x] Add --color-on-accent token (text on accent backgrounds)
- [x] Add z-index token scale (--z-dropdown, --z-modal, --z-toast, --z-overlay)
- [x] Replace 40+ hardcoded colors with CSS tokens
- [ ] Standardize page headers (use PageHeader component or remove it)

### Navigation
- [ ] Add Rail tooltips (title/tooltip on hover)
- [ ] Add Cmd+K command palette hint for new users
- [ ] Fix board-to-chat toggle (use URL routing, back button broken)
- [x] Fix SPA link in Git.tsx (<a> causes full reload, use navigate())

### Components
- [x] Build shared Modal component (Home + Agents both roll their own)
- [x] Build shared Toggle component (from the 2 existing implementations)
- [x] Build shared StatusDot component (pulsing dot pattern used in 5 places)
- [x] Add aria-labels to all icon-only buttons
- [x] Add EventSource cleanup on unmount in Swarm.tsx

### Performance
- [x] Cap Run/Swarm output display to last 500 lines (accumulates unbounded)
- [ ] Extract MissionCard elapsed timer into tiny component (re-renders every 1s)
- [ ] Deduplicate /api/info call on page load (Shell + Home both fetch it)
- [ ] Batch status API calls (3 serial calls -> 1 /api/status endpoint)
- [x] Reduce Shiki grammar chunks (326 -> ~15 used languages, save 8MB)

### Reliability
- [x] Add SSE heartbeat on run/company streams (prevent proxy timeout)
- [x] Add SSE reconnection logic (show "disconnected" banner, auto-retry)
- [ ] Add periodic worktree orphan cleanup (every 30 min)
- [ ] Add DB backup mechanism (.hashmark/studio.db.bak hourly)
- [ ] Add action log rotation (agent-actions.jsonl > 10MB -> .1)
- [x] Flush stream parser on process close (final result event may be lost)
- [x] Use shared stream parser in sessions.ts (currently inline, missing events)

---

## Phase 4 -- Launch Prep

### Distribution
- [ ] Make GitHub repo public
- [ ] Submit to GitHub Marketplace
- [ ] Set up hashmark.md website
- [ ] Publish Privacy Policy + Terms at hashmark.md/privacy and hashmark.md/terms

### Content
- [ ] Publish "Stop Maintaining 7 AI Context Files" launch post
- [ ] Publish "The Complete Guide to AI Context Files" (SEO)
- [ ] Submit PR to Anthropic Claude Code docs

### Growth
- [ ] Add Claude binary pre-flight check at startup (banner if missing)
- [ ] Add desktop notifications for completed runs (Tauri native)
- [ ] Add template tasks for first-time users ("Fix TypeScript errors", "Add tests", etc.)
- [ ] Add usage dashboard (total cost, runs per day, success rate)
- [ ] Add "Delete All Data" button in Settings (GDPR)

---

## Done (this session, 2026-04-01)

- [x] Unified stream-json parser (claude-stream.ts)
- [x] Tool progress UI (elapsed timer, thinking, subagents)
- [x] Cost tracking from result events + DB persistence
- [x] Session resume for runs (resumeRunId)
- [x] Per-agent tool scoping via frontmatter
- [x] Rate limiting (20/hr, 5s cooldown, enforced everywhere)
- [x] System theme toggle (dark/light/system)
- [x] Hashmark attribution in generated files
- [x] WebSocket terminal auth (was CRITICAL -- full RCE)
- [x] Company prompt moved from CLI args to stdin
- [x] CSP locked to localhost:port
- [x] providers.json file permissions (0o600)
- [x] Checkpoint ref validation
- [x] Run timeout resets activeRun
- [x] Swarm rate-limit calls resolve()
- [x] SIGTERM/SIGINT shutdown handler
- [x] Crash recovery marks stuck DB records
- [x] Worktree cleanup catches studio-swarm- prefix
- [x] Run page ?agent= deep link
- [x] Sessions.tsx fetchApi() fix
- [x] SQLite busy_timeout = 5000
- [x] Missing DB indexes (runs.issue_id, runs.status, agent_actions.outcome)
- [x] unhandledRejection handler
- [x] Health check caches spawnSync result
- [x] Light mode accent button contrast
- [x] Swarm Map eviction on completion
- [x] Company.tsx fetchApi() fix
- [x] CI lint/test script fix
- [x] npm audit fix (0 vulnerabilities)
- [x] .nvmrc (Node 20)
- [x] Checkpoint captures unstaged/untracked files
- [x] Robot icon for agents, flat neon app icon restored
- [x] Async folder picker (was freezing UI)
- [x] Cancel no longer crashes (SIGTERM treated as intentional)
- [x] Alt-key accelerators removed (was hijacking macOS)
- [x] Auth token injection in Vite dev mode
- [x] buildClaudeArgs overhaul (stdin delivery, stream-json everywhere)
- [x] Legal docs drafted (Privacy, Terms, EULA)
