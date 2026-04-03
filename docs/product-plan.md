# hashmark studio — Product Plan
> March 28, 2026

---

## The Thesis (one sentence)

**You are the PM. Agents are your engineers. hashmark keeps them briefed, running, and audited.**

That Reddit post from Anthropic is the product brief. The people winning in 2026 are not using one agent at a time and watching it code. They're running multiple agents in parallel and acting as managers. hashmark is the tool that makes that workflow possible — without becoming another IDE.

---

## What We Have Today (Honest Assessment)

Current shell: Rail (52px) + SessionsPanel (196px) + Canvas (chat + terminal drawer) + ContextPanel (184px)

It looks like OpenCode. It acts like OpenCode. One session, one chat, one terminal. You watch one agent code and wait.

That is not the product.

---

## What Needs to Go

### Remove immediately
- **MissionBar** — 36px strip showing model name and project. This info belongs in the chat input, not its own bar. Removing it gives chat 36px more space.
- **ContextPanel** (right side, 184px) — it shows git branch, model, and some stats. Nothing actionable. This is not a PM-facing panel. Remove it entirely. That space becomes available for the parallel agent view later.
- **SessionsPanel always-open** (196px) — sessions should exist but not be always pinned open. Move to rail drawer. When you're focused on a mission, you don't need to see your session history at all times.

### Remove from nav
- `/generate` — already done.

### Remove from thinking
- "Chat interface" — stop thinking of this as a chat app with sessions. Sessions are missions. The mental model shift is critical.

---

## What Changes

### Sessions → Missions
A "session" is a passive word. You open it, you talk to it. A "mission" is active — you dispatch it, it runs, it reports back. Rename everything.

- `sessions` table → stays, but UI calls them "missions"
- SessionsPanel label: "sessions" → "missions"
- "New session" → "New mission"
- Session title → Mission title (auto-generated from first prompt)

This is a naming change with zero backend work. It changes how the user thinks about what they're doing.

### Canvas: Full Width
Remove the always-open sessions panel from home. Canvas gets the full width between rail and right edge. Sessions/missions are accessible via rail icon — clicking opens a slide-over or command palette list.

Before: Rail (52) + Sessions (196) + Canvas (flex) + Context (184) = ~440px wasted on chrome
After: Rail (52) + Canvas (full flex) = everything goes to the conversation

### Chat Input: The Command Center
The chat input is where you dispatch. It needs to show:
- Which mission/agent this message goes to (when running multiple)
- Model selector (already there)
- "Brief" toggle — attach hashmark scanner context before sending
- Active agent status (running / idle / done) as a subtle indicator

This is not a text box anymore — it's a dispatch console.

### Terminal: Already Right
The terminal drawer is correct. Keep it. Terminal slides up when needed, hides when not. Don't touch this.

---

## What Gets Built (Priority Order)

### Phase 1: Clean Up (1-2 days) — Make What We Have Not Embarrassing

1. **Remove MissionBar component from Shell.tsx** — delete the import and JSX, reclaim 36px
2. **Remove ContextPanel from Shell.tsx** — delete the import and JSX, reclaim 184px
3. **Make SessionsPanel a drawer** — clicking the rail icon slides it open, it's not pinned. Full canvas by default.
4. **Rename sessions → missions** in all UI labels (not DB schema — just display strings)
5. **Fix the blank new session on every open** — done (already fixed session restore)

Result: App feels focused. Canvas is the whole screen. No IDE pretension.

---

### Phase 2: Pre-flight Briefing (3-5 days) — The Differentiator

This is what no other app has. Before a message goes to the agent, hashmark attaches relevant context from its scanners.

**How it works:**
1. User types a prompt in the chat input
2. Before sending, hashmark runs a quick analysis pass:
   - What files are likely relevant to this prompt? (grep + token estimator)
   - Are there open security findings that apply? (security scanner results)
   - What's the complexity score of the affected areas? (AST complexity)
3. A "briefing chip" appears below the input showing what will be attached: `"3 findings · 2 hot files · 847 tokens"`
4. User can expand to see what's being attached, or toggle it off
5. On send, the context is prepended to the message

**UI:**
```
[chat input: "refactor the auth module"]
[briefing: 2 security findings · auth.ts complexity: 87 · ~1.2k tokens] [toggle]
[send] [model: Sonnet] [terminal]
```

**Backend:**
- `GET /api/scan/summary?query=refactor+auth+module` — fast, cached scan results filtered by relevance to the query
- Returns top findings, hotspot files, estimated token cost
- Cached on the last scan run — doesn't re-scan on every keystroke

This is the "brief agents before they start" feature. Concrete. Buildable. No other app does this.

---

### Phase 3: Parallel Missions (1-2 weeks) — The PM Dashboard

This is where hashmark becomes the product from the Reddit post.

**The core idea:** You can run multiple missions simultaneously. While agent A is refactoring auth, agent B is adding tests, agent C is fixing a bug. You're the PM. You dispatch, monitor, redirect.

**UI — Mission Board view:**
```
┌──────────────────────────────────────────────────────────────────┐
│  #  hashmark                                                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ACTIVE MISSIONS                                                 │
│                                                                  │
│  ┌────────────────────────┐  ┌────────────────────────┐         │
│  │ auth refactor          │  │ add payment tests       │         │
│  │ ● running · 4m 12s     │  │ ● running · 1m 55s     │         │
│  │ Sonnet 4.6             │  │ Haiku 4.5              │         │
│  │ [view] [stop]          │  │ [view] [stop]          │         │
│  └────────────────────────┘  └────────────────────────┘         │
│                                                                  │
│  COMPLETED                                                       │
│                                                                  │
│  ┌────────────────────────┐                                      │
│  │ fix login bug          │                                      │
│  │ ✓ done · 8m ago        │                                      │
│  │ 3 files changed        │                                      │
│  │ [review] [audit]       │                                      │
│  └────────────────────────┘                                      │
│                                                                  │
│  [+ New mission]                                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Clicking a mission card** opens the canvas for that mission — the chat thread, terminal output, and diff for that specific agent run.

**Dispatching a new mission** opens a compose modal:
- Mission title (optional, auto-generated)
- Prompt
- Model selector
- Briefing toggle (Phase 2 feature)
- Start

This is what "idle time should be spent spinning up another agent" looks like as a UI. Not managing worktrees manually like Emdash. Not watching one chat stream. A board you manage.

---

### Phase 4: Post-run Audit (3-5 days) — Close the Loop

After a mission completes, hashmark runs the diff through its scanners and reports:

**Audit report:**
- Files changed
- New issues introduced (security scanner)
- Complexity delta (did it get better or worse?)
- Token cost of the session
- "Mission summary" — what the agent said it did

**UI:**
- The completed mission card shows: `✓ done · 3 files · +1 security finding`
- Clicking "audit" opens the full report
- Approve or request revision

This is the "audit agents after they finish" feature. It closes the PM loop — you dispatched, it ran, now you review.

---

## What hashmark Is (Final Definition)

**hashmark is a PM console for AI agents.**

Not a terminal. Not an IDE. Not a chat wrapper.

You open it when you have a problem to solve. You dispatch one or more agents at it with a briefing from your codebase's actual state. You monitor them like a PM monitors engineers. When they finish, you audit the output before approving it.

The workflow: **Brief → Dispatch → Monitor → Audit → Approve**

Nobody else is building this exact loop. Warp is a terminal. Emdash is trying to build an IDE with parallel agents. Conductor is a Claude Code launcher. OpenCode is a pretty chat window.

hashmark is the one where the agent already knows about your code before you ask it anything — and the one where you can run three of them at once.

---

## Execution Order

| Phase | What | Time | Impact |
|-------|------|------|--------|
| 1 | Remove MissionBar + ContextPanel + unpin sessions | 1 day | High — app immediately feels focused |
| 2 | Rename sessions to missions (UI only) | 2 hours | Medium — mental model shift |
| 3 | Pre-flight briefing chip in chat input | 3-5 days | Very high — first unique feature |
| 4 | Mission board view (parallel agents) | 1-2 weeks | Product-defining |
| 5 | Post-run audit report | 3-5 days | Closes the PM loop |

Start with Phase 1 today. It costs nothing and makes what we have usable.
