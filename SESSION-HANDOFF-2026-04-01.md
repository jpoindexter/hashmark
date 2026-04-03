# Session Handoff -- 2026-04-01
**Branch:** feature/shell-redesign | **Commits this session:** 32 | **Duration:** ~8 hours

Everything from this session in one place. Read this to resume where we left off.

---

## What Got Done

### Features Shipped (8)
1. **Unified stream-json parser** (`server/lib/claude-stream.ts`) -- handles ALL Claude Code SDK event types
2. **Tool progress UI** -- Run page shows `[Bash] running... 12s` with live elapsed timer
3. **Cost tracking** -- captures `total_cost_usd` from Claude result events, persists to DB
4. **Session resume for runs** -- `resumeRunId` in POST body, passes `--resume` to Claude
5. **Per-agent tool scoping** -- `tools:` frontmatter in agent .md files maps to `--allowedTools`
6. **Rate limiting** -- 20 invocations/hour, 5s cooldown, enforced on sessions + run + swarm
7. **System theme toggle** -- dark/light/system cycle, follows OS preference
8. **Hashmark attribution** -- footer in generated markdown files

### Bugs Fixed (24)
- **Security (5):** WebSocket terminal auth, company prompt in CLI args, CSP lockdown, providers.json permissions, checkpoint ref validation
- **Crashes (4):** Run timeout hanging forever, swarm rate-limit Promise hang, DiffDrawer crash (file vs path), async folder picker freeze
- **Architecture (5):** SIGTERM shutdown handler, stuck DB records on crash recovery, worktree cleanup missing prefix, checkpoint captures unstaged files, health check caches spawnSync
- **UI (4):** Light mode button contrast (#000 on accent), robot icon for agents, auth token injection in Vite dev mode, Alt-key menu accelerators hijacking macOS
- **Other (6):** API rate limiting removed (local app), bare fetch() in Sessions + Company, CI lint script, npm audit fix, .nvmrc, swarm memory leak eviction

### Docs Created (4)
- `AUDIT-REPORT.md` -- 220 findings from 15 agents, prioritized fix backlog
- `STEAL-FROM-CLAUDE-CODE.md` -- 15 features to port, tiered by priority
- `legal/PRIVACY.md`, `legal/TERMS.md`, `legal/EULA.md` -- draft legal docs
- `CLAUDE.md` updated with safety rules section

---

## Audit Summary (15 agents, 220 findings)

### Already Fixed: 24 issues
### Remaining P0s (12):
1. dist/ tracked in git (34MB artifacts) -- `git rm -r --cached dist/`
2. No Tauri build CI workflow
3. No auto-updater for desktop app
4. 6 features hidden from Rail nav (Swarm, Company, Git, Files, History, Governance)
5. No LICENSE file (need to pick: MIT, BSL, or proprietary)
6. Anthropic ToS written approval needed for CLI spawning
7. No first-run onboarding
8. Self-host JetBrains Mono font (currently @import blocks render)
9. Git.tsx string concat colors produce invalid CSS
10. taskStore in-memory grows forever (no eviction)
11. No data retention policy
12. Empty catch blocks everywhere (50+, zero debug visibility)

### Remaining P1s (~70):
See AUDIT-REPORT.md for full list. Top priorities:
- Sessions chat doesn't use shared stream parser (missing events)
- Dual toast systems (toast() vs studio:toast event)
- loadAgents() duplicated 3x
- Company auto-merges without user approval
- 40+ hardcoded colors bypass token system
- No spacing tokens (every margin/padding is raw pixels)
- Swarm SSE listeners never removed
- Model lists duplicated 4x with different entries

---

## Claude Code Source Analysis

### Source location
`~/Downloads/claude code source/` -- TypeScript, ~390K LOC, Bun bundled, v2.1.87

### Key reference files
| File | What it has |
|------|------------|
| `entrypoints/sdk/coreSchemas.ts` | ALL stream-json event type definitions |
| `services/compact/compact.ts` | 5 compaction strategies |
| `services/autoDream/autoDream.ts` | Background memory consolidation |
| `coordinator/coordinatorMode.ts` | Multi-agent system prompt |
| `utils/forkedAgent.ts` | Cache-sharing subagent pattern |
| `services/api/withRetry.ts` | 10-retry exponential backoff |
| `cost-tracker.ts` | Per-model token tracking + USD calculation |
| `utils/permissions/` | 24-file permission system, 5 levels |
| `constants/spinnerVerbs.ts` | 204 thinking verbs |

### Features to build (priority order)
1. **Retry + backoff** -- 10 retries, exponential, fallback model. We have zero retry logic.
2. **Compaction** -- 5 strategies (microcompaction first: truncate tool outputs). Sessions grow unbounded.
3. **Forked agent cache sharing** -- `CacheSafeParams` pattern. Swarm costs 3x what it should.
4. **Permission cascade** -- 5 levels (default, acceptEdits, plan, auto, bypass) instead of binary toggle.
5. **Dream mode** -- Background agent reviews sessions every 24h, consolidates learnings.
6. **Session memory** -- Periodic background updates to .session.md for cross-session continuity.

### Key constants from Claude Code
```
AUTOCOMPACT_BUFFER_TOKENS = 13,000
WARNING_THRESHOLD_BUFFER_TOKENS = 20,000
DEFAULT_MAX_RETRIES = 10
MAX_529_RETRIES = 3
BASE_DELAY_MS = 500
PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000
HEARTBEAT_INTERVAL_MS = 30,000
MEMORY.md max: 200 lines / 25KB
```

### Already integrated from Claude Code
- Stream-json parser (all SDK event types)
- Tool scoping (--allowedTools per agent from frontmatter)
- Cost tracking from result events
- Session resume via --resume
- Agent subagent support (Agent in TOOL_PRESETS.full)

---

## Claw-Code Analysis (Rust reimplementation)

**Repo:** github.com/instructkr/claw-code (MIT license)
**Size:** 20K Rust LOC + Python analysis layer
**Status:** 70% feature parity with Claude Code

### Useful patterns to steal:
- **Permission mode enum** (ReadOnly/WorkspaceWrite/DangerFullAccess) -- cleaner than our binary toggle
- **Hierarchical config loading** (.claw.json from CWD up to home)
- **Tool registry abstraction** (specs separated from execution)
- **MCP tool naming normalization** (mcp_tool_prefix() for collision prevention)
- **Incremental SSE parser** (handles partial frames better than ours)

### Not useful for us:
- Rust CLI itself (we're web UI, not TUI)
- Python analysis layer (interesting but not applicable)
- Session JSON format (we use SQLite)

### Key insight:
Claude Code's architecture is not special. A 20K LOC Rust reimplementation got to 70% parity. The value is in orchestration patterns (compaction, dream mode, coordinator), not the harness itself. Hashmark's advantage is the web UI + multi-agent orchestration.

---

## Architecture Decision

**Decision (2026-04-01):** Stay TypeScript. Clean up Tauri integration.

**Current architecture (hacky):**
```
Tauri (Rust) → spawns Node → Hono server on :3200
→ Webview → HTTP to localhost → auth tokens → CORS → SSE
```

**Target architecture (clean):**
```
Tauri (Rust) → manages Node sidecar (lifecycle tied to app)
→ Webview → same HTTP but port managed by Tauri, no orphan processes
```

**Why not Rust rewrite:**
- AI ecosystem is TS-first (SDKs, MCP, AI SDK)
- Speed of iteration matters more than runtime perf
- We spawn Claude CLI, not calling APIs directly
- 220 audit issues are all fixable in TS
- Contributors: 50x more TS developers than Rust

**What actually future-proofs:**
Not the language. The features: compaction, retry, cache sharing, dream mode, plugin system. Build those.

---

## Remaining TODO (business, not code)

1. Make GitHub repo public + submit to Marketplace
2. Publish "Stop Maintaining 7 AI Context Files" launch post
3. Publish "The Complete Guide to AI Context Files" (SEO)
4. Submit PR to Anthropic docs linking hashmark
5. Get written confirmation from Anthropic that CLI spawning is permitted
6. Add a LICENSE file (BSL recommended for commercial + open source)
7. Have a lawyer review legal/PRIVACY.md, legal/TERMS.md, legal/EULA.md

---

## Next Session Priority

1. Wire Tauri managed sidecar (clean architecture)
2. Implement retry + exponential backoff for all Claude spawns
3. Implement microcompaction (truncate tool outputs in session history)
4. Add hidden features to Rail nav
5. Fix remaining P0s from audit
6. Start on permission cascade (5 levels)
