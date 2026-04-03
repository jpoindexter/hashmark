# The Harness Platform Play

> Extract Claude Code's harness patterns into a reusable TypeScript library.
> Build multiple products on top of it. Hashmark is the flagship.

---

## The Insight

The most valuable thing in the Claude Code source isn't the UI, the terminal renderer, or the Ink components. It's the **harness** -- the invisible layer between "user types a message" and "Claude does useful work." This layer handles:

- Context window management (compaction, summarization, pruning)
- Tool orchestration (permissions, execution, result handling)
- Agent lifecycle (spawn, cache sharing, abort, retry)
- Session persistence (memory, state, resume)
- Cost control (token tracking, budget enforcement)

Every AI product being built right now reinvents this layer from scratch. Hashmark did. Conductor did. Emdash did. OpenCode did. The harness is the hard part, and nobody has extracted it into a library.

Claw Code Parity started this work -- clean-room Python/Rust port of the patterns. But it's an archive, not a product. The play is to take these patterns, ship them as a TypeScript library, and build your product line on top.

---

## The Library: `@hashmark/harness`

A zero-dependency TypeScript library that provides the agent harness primitives. Not a framework -- a set of composable modules that any Node.js app can import.

### Module Map

```
@hashmark/harness
  /conversation    Session management, message history, resume
  /compaction      Context window management (all 5 strategies)
  /tools           Tool definition, permission, execution pipeline
  /agents          Agent spawn, cache sharing, lifecycle
  /retry           Exponential backoff, fallback models, heartbeat
  /memory          Session memory, dream mode, cross-agent learning
  /cost            Token tracking, budget enforcement, usage analytics
  /stream          SSE/streaming helpers, delta-aware storage
```

### What Each Module Does

**`/conversation`**
The session runtime. Manages the message array, tracks token usage, handles resume from persisted state. Provider-agnostic -- works with Anthropic SDK, OpenAI, or a local CLI.

Source patterns:
- `ConversationRuntime` from Claw Code Parity's `conversation.rs`
- Session persistence from `session.rs` (JSONL snapshots, rotation)
- Message role types, content block types, usage tracking

```typescript
import { Session, ConversationRuntime } from "@hashmark/harness/conversation";

const session = Session.create();
const runtime = new ConversationRuntime({
  session,
  apiClient: anthropic,
  tools: myTools,
  onTurnComplete: (summary) => { /* track usage, trigger memory */ },
});

const result = await runtime.runTurn("Fix the auth bug");
// result: { messages, usage, autoCompaction }
```

**`/compaction`**
All 5 compaction strategies from Claude Code, extracted as composable functions:

1. **Microcompaction** -- truncate large tool results in history. Already ported to Hashmark.
2. **Smart pruning** -- selectively remove tool outputs from older turns while keeping conversation flow. Already ported to Hashmark.
3. **Traditional compaction** -- replace old messages with a structured summary. Just ported to Hashmark (the compactSession work from this session).
4. **Reactive compaction** -- triggered by prompt-too-long errors, drops oldest API-round groups.
5. **API context management** -- native provider-side clearing (clear_tool_uses, clear_thinking).

Plus the decision logic: when to trigger each strategy, threshold calculation, circuit breaker after 3 consecutive failures.

```typescript
import { smartPrune, compactSession, shouldAutoCompact } from "@hashmark/harness/compaction";

// Pipeline: prune first, compact if still over threshold
const pruned = smartPrune(messages, { targetFreeTokens: 20_000 });
if (shouldAutoCompact(tokenUsage, model)) {
  const result = compactSession(pruned.messages, existingSummary);
  // result.messages = [summary, ...recentMessages]
}
```

**`/tools`**
Tool definition, permission checking, and execution pipeline. The hard part isn't defining tools -- it's the permission cascade, abort handling, and result processing.

- 5 permission levels: default, acceptEdits, plan, auto (classifier decides), bypass
- Tool result truncation (microcompaction at the tool level)
- Abort propagation (parent abort cancels child tools)
- Tool scoping per agent/skill (allowedTools frontmatter)

```typescript
import { ToolRegistry, PermissionPolicy } from "@hashmark/harness/tools";

const registry = new ToolRegistry();
registry.register({
  name: "bash",
  execute: async (input) => { /* spawn shell */ },
  permission: "requireApproval",
});

const policy = new PermissionPolicy("acceptEdits");
// policy.check("bash", input) -> "approved" | "denied" | "prompt_user"
```

**`/agents`**
Agent spawn, forked agent cache sharing, coordinator mode, and worker management.

The killer feature from Claude Code: forked agents share the parent's prompt cache via `CacheSafeParams`. When your swarm spawns 3 agents, the second and third reuse ~80% of the input tokens from the first.

```typescript
import { forkAgent, CacheSafeParams } from "@hashmark/harness/agents";

const cacheSafeParams: CacheSafeParams = {
  systemPrompt: basePrompt,
  tools: toolDefinitions,
  forkContextMessages: sharedContext,
};

// Compact agent (cheap, shares parent cache)
const compactResult = await forkAgent({
  messages: conversationToSummarize,
  cacheSafeParams,
  label: "compact",
  maxOutputTokens: 20_000,
});

// Worker agent (full tool access, isolated context)
const workerResult = await forkAgent({
  messages: [{ role: "user", content: taskPrompt }],
  cacheSafeParams,
  canUseTool: (name) => allowedTools.includes(name),
  label: `worker-${i}`,
});
```

**`/retry`**
Exponential backoff with model fallback, persistent mode for unattended runs, and heartbeat to prevent client timeouts.

Constants matched to Claude Code:
- 10 retries default, 3 for 529 (overloaded)
- 500ms base delay, 5min max backoff in persistent mode
- 30s heartbeat interval
- Fallback model support (try sonnet if opus fails)

```typescript
import { withRetry } from "@hashmark/harness/retry";

const response = await withRetry(
  () => anthropic.messages.create({ model: "claude-sonnet-4-6", messages }),
  {
    maxRetries: 10,
    baseDelay: 500,
    fallbackModel: "claude-haiku-4-5",
    onHeartbeat: () => send({ type: "heartbeat" }),
    persistent: true, // unattended mode: longer backoff, never give up
  }
);
```

**`/memory`**
Session memory (periodic background extraction), dream mode (background consolidation), and cross-agent learning.

- Session memory: every N turns, fork a lightweight agent to extract durable learnings
- Dream mode: 4-phase background process (Orient, Gather, Consolidate, Prune)
- Gates: time since last consolidation + session count + file lock
- Storage: markdown files in project directory

```typescript
import { SessionMemory, DreamMode } from "@hashmark/harness/memory";

const memory = new SessionMemory({
  dataDir: ".hashmark",
  extractEveryNTurns: 5,
  maxSizeKb: 25,
});

// After each turn
await memory.onTurnComplete(sessionId, messages);

// Background consolidation (runs when user is away)
const dream = new DreamMode({
  dataDir: ".hashmark",
  minSessionCount: 5,
  minHoursSinceLastRun: 24,
});
await dream.runIfReady();
```

**`/cost`**
Token tracking, budget enforcement, and usage analytics. Tracks cumulative usage across turns, estimates costs by model, and enforces per-session or per-agent budgets.

```typescript
import { UsageTracker, CostCalculator } from "@hashmark/harness/cost";

const tracker = new UsageTracker();
tracker.record({ inputTokens: 1500, outputTokens: 800, model: "claude-sonnet-4-6" });

const cost = CostCalculator.estimate(tracker.cumulative());
// { inputCost: 0.0045, outputCost: 0.012, total: 0.0165 }

if (tracker.cumulative().inputTokens > budget) {
  throw new BudgetExceededError(tracker.cumulative());
}
```

**`/stream`**
SSE streaming helpers, delta-aware storage, and stream event parsing. Abstracts the differences between Anthropic SDK streaming, OpenAI streaming, and Claude CLI JSON streaming.

```typescript
import { createStreamAdapter, DeltaStore } from "@hashmark/harness/stream";

const adapter = createStreamAdapter("anthropic");
const deltaStore = new DeltaStore(db, "session_messages");

for await (const event of adapter.stream(response)) {
  switch (event.type) {
    case "text":
      deltaStore.append(messageId, event.text); // debounced DB writes
      send({ type: "text", text: event.text });
      break;
    case "tool_use":
      send({ type: "tool_use", tool: event.tool, input: event.input });
      break;
  }
}

deltaStore.flush(); // final write
```

---

## Products Built on the Harness

### Product 1: Hashmark Studio (flagship)

**What it is**: Desktop app for AI agent orchestration. Scan your codebase, generate agent teams, run them on issues, chat with Claude -- all in one window.

**How it uses the harness**:
- `/conversation` + `/compaction` -- powers multi-turn chat with context management
- `/agents` -- swarm mode, company mode, cache-sharing across workers
- `/tools` -- permission cascade for Claude CLI tool calls
- `/memory` -- session memory + dream mode for cross-session learning
- `/retry` -- backoff on API errors, fallback models
- `/stream` -- SSE streaming to the React client
- `/cost` -- usage dashboard, per-agent cost tracking

**Revenue**: SaaS at $19/mo (Pro) and $29/seat/mo (Team). Free tier with 1 repo.

**Status**: Phase 1 complete, Phase 2 features mostly done, Phase 3 polish in progress. Closest to shippable.

### Product 2: Hashmark CLI

**What it is**: `npx hashmark` -- scans your codebase, generates AI context files for every tool (CLAUDE.md, AGENTS.md, .cursorrules, etc.). The free gateway drug to Studio.

**How it uses the harness**:
- `/conversation` -- single-turn agent call for generation
- `/cost` -- token budget enforcement (keep CLI runs cheap)
- `/retry` -- backoff on API failures
- `/stream` -- terminal output streaming

**Revenue**: Free (drives Studio signups). Published on npm.

**Status**: Already works. Needs polish and npm publish.

### Product 3: Harness-as-a-Service API

**What it is**: Hosted API that wraps the harness library. Developers POST a prompt + tools, get back a managed agent session with built-in compaction, retry, cost tracking, and persistence. Like Vercel for agent orchestration.

**How it uses the harness**: Everything. The entire library is the product.

**Why it works**: Building an agent is easy. Operating one in production is hard. Compaction, retry, cost control, session persistence, tool permissions -- every team rebuilds this. A hosted harness handles it.

```
POST /v1/sessions
{ "system": "...", "tools": [...], "message": "Fix the auth bug" }

Response: SSE stream of agent actions + final result
Session auto-compacts, retries on failure, tracks cost, persists state.
```

**Revenue**: Usage-based. $X per 1K agent turns. Free tier for hobbyists.

**Status**: Not started. Requires the library to be extracted first. Could be built in 2-3 weeks on top of Hono + the harness library.

### Product 4: Agent Marketplace

**What it is**: A registry of pre-built agent definitions (markdown + frontmatter) that plug into any harness-powered product. Like npm for AI agents.

**How it uses the harness**:
- `/agents` -- agent loading, validation, tool scoping
- `/tools` -- tool permission enforcement per agent
- `/memory` -- agent-specific memory and learning

**Revenue**: Free to browse/install. Premium agents at $5-20 each (curated, tested, maintained). Revenue share with creators.

**Status**: Not started. The agent format already exists (AGENTS.md with YAML frontmatter). Needs a registry, web UI, and install flow.

### Product 5: Fabrk Integration

**What it is**: You already have Fabrk, a SaaS boilerplate at $349. Add a "Deploy with AI Agents" feature that uses the harness to give every Fabrk project a built-in agent team.

**How it uses the harness**:
- `/conversation` + `/compaction` -- embedded chat in every Fabrk app
- `/agents` -- pre-configured agent team per template
- `/cost` -- budget enforcement per workspace

**Revenue**: Upsell on Fabrk. "AI Agent Add-on" at $49/mo per workspace.

**Status**: Fabrk already ships. Integration requires the harness library to be extracted.

---

## Extraction Plan

### Phase 1: Extract from Hashmark (Week 1-2)

The harness code already exists inside Hashmark's `server/lib/` directory. Extract it.

1. Create `packages/harness/` in the hashmark monorepo
2. Move these files (they're already standalone):
   - `server/lib/compaction.ts` -> `packages/harness/src/compaction.ts`
   - `server/lib/session-memory.ts` -> `packages/harness/src/memory.ts`
   - `server/lib/retry.ts` -> (if exists, or create from the retry work already done)
   - `server/lib/claude-stream.ts` -> `packages/harness/src/stream.ts`
   - `server/lib/ai-stream.ts` -> `packages/harness/src/stream-providers.ts`
3. Add types, exports, and a package.json
4. Update Hashmark server to import from `@hashmark/harness` instead of `../lib/`
5. Verify: `npm run build` still works, `npm run typecheck` passes

### Phase 2: Port Missing Patterns from Claw + Claude Code Source (Week 2-3)

Use the Claude Code source (`~/Downloads/src`) and Claw Code Parity as references:

1. **Reactive compaction** -- handle prompt-too-long errors by dropping oldest API-round groups
   - Source: `src/services/compact/compact.ts` (truncateHeadForPTLRetry)
   - Claw: `compact.rs` (grouping logic)

2. **Forked agent cache sharing** -- CacheSafeParams for swarm cost reduction
   - Source: `src/utils/forkedAgent.ts` (runForkedAgent, createSubagentContext)
   - Claw: `conversation.rs` (auto_compaction integration)

3. **Conversation runtime** -- the main query loop (send message, handle tool calls, loop)
   - Source: `src/QueryEngine.ts`
   - Claw: `conversation.rs` (ConversationRuntime)

4. **Tool registry** -- define tools, check permissions, execute, handle results
   - Source: `src/Tool.ts`, `src/tools/`
   - Claw: N/A (not fully ported yet)

5. **Cost calculator** -- per-model pricing, cumulative tracking
   - Source: `src/cost-tracker.ts`
   - Claw: `conversation.rs` (UsageTracker)

### Phase 3: Publish (Week 3-4)

1. Add README with examples for each module
2. Add tests (port from Claw's Rust test suite -- they're thorough)
3. Publish to npm as `@hashmark/harness`
4. Set up GitHub repo: `hashmark/harness`
5. Write launch post: "The Agent Harness That Powers Claude Code, Now Open Source"

### Phase 4: Build Products (Week 4+)

With the library published:
- Hashmark Studio already uses it (extraction was non-breaking)
- Hashmark CLI switches to it (replace inline logic)
- Harness API: new Hono server wrapping the library
- Agent Marketplace: registry + web UI + install flow
- Fabrk integration: embed the conversation module

---

## Why This Is The Highest-Leverage Play

**1. Moat through infrastructure.**
Every AI coding tool needs a harness. If yours is the one they use, you're a dependency. Dependencies don't get replaced.

**2. Multiple revenue streams from one core.**
The library is free. The products built on top of it charge money. Studio (desktop SaaS), API (usage-based), Marketplace (rev share), Fabrk integration (upsell). One codebase, four income sources.

**3. Community flywheel.**
Open-source the harness library. Developers use it to build their own tools. They find bugs, contribute fixes, add features. Your products stay ahead because you wrote the library and know it best.

**4. Timing.**
Claude Code's source is in the wild. Claw Code Parity has 4.5K stars and climbing. The demand for "how do I build my own Claude Code" is real and growing. Ship the library now and you're the answer.

**5. Defense against Anthropic.**
If Anthropic ships an official harness SDK, you're competing on their turf. But if you ship first and build a product ecosystem on top, switching costs protect you. Nobody rips out their infrastructure library to save $5/mo.

**6. Hashmark gets better automatically.**
Every improvement to the harness library improves every product. Fix compaction once, all products benefit. Add a new provider adapter, all products support it. The library is the rising tide.

---

## Revenue Projections

Assuming the $1K MRR target from mission.md:

| Product | Price | Users to hit $1K MRR | Timeline |
|---------|-------|---------------------|----------|
| Hashmark Studio Pro | $19/mo | 53 users | Ship first, closest to done |
| Hashmark Studio Team | $29/seat/mo | 35 seats | After Pro traction |
| Harness API | ~$0.01/turn | ~100K turns/mo | After library extraction |
| Agent Marketplace | $5-20/agent | 50-200 sales/mo | After ecosystem grows |
| Fabrk AI Add-on | $49/mo | 21 workspaces | After Fabrk integration |

**Fastest path to $1K MRR**: Ship Hashmark Studio Pro. 53 users at $19/mo. The product is 90% built. The harness library extraction happens in parallel -- it's a refactor, not a rewrite.

---

## What To Do Monday

1. **Ship Hashmark Studio Pro.** It's the closest to done. Get to $1K MRR.
2. **Extract the harness in parallel.** Move `server/lib/` to `packages/harness/`. Non-breaking refactor.
3. **Port the remaining Tier 1 patterns.** Reactive compaction, cache sharing, conversation runtime. Use Claude Code source + Claw as references.
4. **Publish `@hashmark/harness` on npm.** Write the launch post. Post to HN, Reddit, Bluesky.
5. **Start the API.** New Hono server, wraps the library, usage-based pricing.

The library is the platform. Hashmark is the proof it works. Everything else grows from there.
