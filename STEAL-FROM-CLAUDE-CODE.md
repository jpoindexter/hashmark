# Features to Steal from Claude Code Source

Reference doc for hashmark studio development. Sourced from Claude Code v2.1.87 leaked source maps.

---

## Tier 1: Build Next (high impact, patterns already understood)

### 1. Compaction Strategies (5 strategies)
When context fills up, Claude Code doesn't just summarize. It uses 5 strategies:
- **Microcompaction** -- truncate large tool results (file reads, bash output) before they enter history
- **Session Memory** -- lightweight memory file updates without full summarization
- **Traditional** -- fork an agent to summarize the conversation
- **Reactive** -- stream-based compaction triggered by prompt-too-long errors
- **Snip** -- truncate old messages at API-round boundaries

Key constants: `AUTOCOMPACT_BUFFER_TOKENS = 13000`, `WARNING_THRESHOLD = 20000`

**For hashmark:** Our sessions grow unbounded. Implement microcompaction first (truncate tool outputs in history) then traditional (fork a summarizer agent).

### 2. Dream Mode (Background Memory Consolidation)
Runs in background when user is away. 4-phase prompt: Orient, Gather, Consolidate, Prune.

Gates: `>= 24h since last consolidation` + `>= 5 sessions` + file lock.

Uses forked agent pattern (shares prompt cache with parent).

**For hashmark:** We have 86 agents + session history. Dream mode could auto-improve agent definitions based on run history, consolidate learnings across sessions.

### 3. Coordinator Mode (Multi-Agent Orchestration)
System prompt injection makes Claude a "coordinator" that spawns workers. Workers share prompt cache via `CacheSafeParams`. Coordinator gets special tools: `AgentTool`, `SendMessageTool`, `TaskStopTool`.

Workers get scratchpad directory for durable cross-worker state.

**For hashmark:** Our Company mode is similar but simpler. Add shared prompt cache, scratchpad dir, and SendMessage between agents.

### 4. Forked Agent Cache Sharing
The killer optimization: forked agents (compact, dream, memory extraction) share the parent's prompt cache by receiving `CacheSafeParams` containing pre-hashed system prompt + tools + context messages. The fork branches off the shared cache instead of rebuilding from scratch.

**For hashmark:** When our swarm spawns 3 agents, each currently starts cold. If they share a base context (project CLAUDE.md + agent definitions), we'd save ~80% of input tokens on the second and third agents.

### 5. Retry + Backoff Logic
10 retries default. 529 (overloaded) gets 3 retries. Persistent retry mode for unattended runs with 5min max backoff. Heartbeat every 30s to prevent timeout. Fallback model support.

**For hashmark:** We currently have zero retry logic. When Claude 500s, the run fails. Add exponential backoff with fallback.

---

## Tier 2: Build Soon (medium impact)

### 6. Prompt Cache Break Detection
Tracks 15+ state hashes (system prompt, tools, betas, model, effort, cache strategy). When cache breaks unexpectedly, logs a diff file. Uses "sticky-on latching" for state that shouldn't break cache mid-session.

**For hashmark:** Would help debug why some runs are expensive (cache miss = full repay of input tokens).

### 7. Auto Mode / Permission Cascade
5 permission levels: default, acceptEdits, plan, auto (classifier decides), bypassPermissions.
Cycle with Shift+Tab. Auto mode uses a transcript classifier to decide permissions per-tool.

**For hashmark:** We have a binary toggle (dangerous skip or not). A middle ground (acceptEdits) would be safer and more useful.

### 8. Session Memory (Periodic Background Updates)
Every N turns, a background fork writes to `.session.md` with learnings from the conversation. Separate from user-facing MEMORY.md. Used for cross-session continuity.

**For hashmark:** Our sessions don't learn from each other. If agent A discovers the project uses Prisma, agent B should know without being told.

### 9. Skills System (File-based + Bundled)
Markdown files with YAML frontmatter define skills:
```yaml
---
name: "Custom Skill"
allowedTools: "Read, Write"
model: "claude-opus-4-5"
paths: "src/**"
---
Skill prompt content...
```

Loaded from `.claude/skills/` + `~/.claude/skills/`. Project overrides user.

**For hashmark:** Our agents are similar but skills add tool scoping, model override, and path restrictions. We could merge the concepts.

### 10. Output Styles
Markdown files define custom rendering styles. Loaded from `.claude/output-styles/`. Users can extend.

**For hashmark:** Let users customize how agent output is displayed (verbose vs compact, markdown vs plain).

---

## Tier 3: Nice to Have

### 11. Spinner Verbs (204 verbs)
"Bootstrapping", "Caramelizing", "Flibbertigibbeting", "Whatchamacalliting"...
Configurable in settings (replace or append).

**For hashmark:** Fun polish for the status bar during runs.

### 12. Anti-Distillation (Fake Tool Calls)
Sends fake tool calls into history to poison training data if someone tries to distill from run logs.

**For hashmark:** Not needed for us since we're not a model provider.

### 13. Undercover Mode
System prompt says "do not blow your cover" -- for Anthropic employees contributing to external projects.

**For hashmark:** Fun easter egg potential.

### 14. Feature Flags (GrowthBook)
`getFeatureValue_CACHED_MAY_BE_STALE()` returns immediately from disk cache, refreshes async. Used for all major features.

**For hashmark:** We could add a feature flag system for experimental features (swarm, company, etc).

### 15. Vim Mode State Machine
TypeScript discriminated unions for vim states. Tracks persistent state (last change, last find, register).

**For hashmark:** Our terminal uses xterm.js which has its own vim bindings. Not needed.

---

## Architecture Patterns to Copy

| Pattern | Where in Claude Code | How to use in hashmark |
|---------|---------------------|----------------------|
| Closure-scoped state | `initAutoDream()` | Test isolation for agent runners |
| Feature-gated lazy loading | `feature('GATE') ? require(...) : null` | Experimental features |
| Forked agent cache sharing | `CacheSafeParams` | Swarm cost reduction |
| Ticker-based gates | Time + count + lock | Dream mode scheduling |
| API round grouping | Message ID boundaries | Better compaction |
| Sticky-on latching | Cache break detection | Prevent false cache misses |
| JSONL transcripts | Session storage format | Run history persistence |
| Markdown + frontmatter | Skills, output styles | Agent/skill definitions |

---

## Key Constants to Match

```
AUTOCOMPACT_BUFFER_TOKENS = 13,000
WARNING_THRESHOLD_BUFFER_TOKENS = 20,000
MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000
DEFAULT_MAX_RETRIES = 10
MAX_529_RETRIES = 3
BASE_DELAY_MS = 500
PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000
HEARTBEAT_INTERVAL_MS = 30,000
SESSION_SCAN_INTERVAL_MS = 10 * 60 * 1000
MEMORY.md max: 200 lines / 25KB
```
