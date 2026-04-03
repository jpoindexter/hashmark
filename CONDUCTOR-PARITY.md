# Conductor Parity Plan

> Upgrade hashmark to match Conductor's architecture and feel.
> No more "we can't" -- everything here is buildable.

---

## Architecture Upgrade: CLI Spawning -> Bidirectional RPC

### Current (broken)
```
Client -> HTTP POST /api/sessions/:id/chat -> spawn `claude --print` -> parse stdout -> SSE back to client
```
Problems:
- No real-time tool approval (CLI just runs or blocks)
- No plan mode toggle mid-conversation
- No compaction feedback
- Tool calls parsed from text output, not structured events
- Each message spawns a new process (or uses --resume which is fragile)

### Target (Conductor's model)
```
Client <-> WebSocket <-> Sidecar (Node.js) <-> Claude API (Anthropic SDK directly)
```
Benefits:
- Bidirectional: backend pushes events, frontend sends approvals
- Structured message blocks (text, thinking, tool_use, tool_result)
- Real-time tool approval inline
- Plan mode toggle mid-conversation
- Compaction state visible to frontend
- Token tracking per message from API response
- No CLI parsing, no process spawning per message

### How to Build It

**Phase 1: Replace CLI spawning with Anthropic SDK (1-2 days)**

We already have `@anthropic-ai/sdk` as a dependency. The API path in sessions-chat.ts already uses `streamAIResponse()` which calls the API directly. The CLI path is the one that spawns `claude --print`.

1. Make the API path the default (not just when a provider API key is set)
2. Use Claude Code's OAuth token (already available via `claude auth status`) for API auth
3. Drop the CLI spawning path entirely for chat sessions

Files to change:
- `server/routes/sessions-chat.ts` -- remove the CLI path, use API-only
- `server/lib/ai-stream.ts` -- enhance to return structured blocks, not just text chunks

**Phase 2: Add Tool Execution Engine (2-3 days)**

Conductor bundles Claude Code's engine (`internal.bundled.js`). We can build our own tool executor or use the Claude API's tool_use feature directly.

1. Define tools as Anthropic API tool schemas (bash, read, write, edit, glob, grep)
2. When Claude returns a `tool_use` block, execute it server-side
3. Send the `tool_result` back to Claude in the next API turn
4. Stream each step to the frontend via SSE/WebSocket

Files to create:
- `server/lib/tool-executor.ts` -- execute tools (bash, file read/write/edit, glob, grep)
- `server/lib/tool-schemas.ts` -- Anthropic API tool definitions
- `server/lib/tool-approval.ts` -- approval logic (auto-approve reads, prompt for writes/bash)

Files to change:
- `server/routes/sessions-chat.ts` -- implement the tool loop (send message -> get tool_use -> execute -> send result -> loop)

**Phase 3: Bidirectional Communication (1 day)**

Replace SSE (one-way) with WebSocket (two-way) for the chat stream.

1. Add WebSocket endpoint: `ws://localhost:3200/api/sessions/:id/ws`
2. Backend pushes: `message`, `thinking`, `tool_use`, `tool_result`, `tool_approval_request`, `plan_mode`, `compaction_status`
3. Frontend sends: `approve_tool`, `deny_tool`, `cancel`, `exit_plan_mode`, `user_message`

Files to create:
- `server/routes/sessions-ws.ts` -- WebSocket handler
- `client/src/hooks/useSessionSocket.ts` -- WebSocket client hook

Files to change:
- `client/src/components/chat-input/useStreamChat.ts` -- switch from SSE fetch to WebSocket

**Phase 4: Structured Message Blocks (1 day)**

Store messages as typed blocks instead of raw text.

1. Add `blocks` column to session_messages (JSON array of typed blocks)
2. Each block: `{ type: "text" | "thinking" | "tool_use" | "tool_result", ... }`
3. Frontend renders each block type with its own component (already have ThinkingBlock, ToolResultCard)

Schema migration:
```sql
ALTER TABLE session_messages ADD COLUMN blocks TEXT; -- JSON array
```

**Phase 5: Inline Tool Approval UI (1 day)**

When Claude wants to run a tool that needs approval:

1. Backend sends `tool_approval_request` via WebSocket with tool name, input, risk level
2. Frontend shows inline approval card: "Claude wants to run `rm -rf node_modules`. [Allow] [Deny] [Allow All]"
3. User clicks -> frontend sends `approve_tool` or `deny_tool` via WebSocket
4. Backend continues the tool loop

Component to create:
- `client/src/components/chat/ToolApprovalCard.tsx`

**Phase 6: Real-Time Plan Mode (0.5 days)**

1. Backend detects when Claude enters plan mode (from API response or tool call)
2. Sends `plan_mode` event via WebSocket
3. Frontend shows plan mode indicator + "Exit Plan" button
4. User clicks -> frontend sends `exit_plan_mode` -> backend sends API message to exit

---

## Visual Design: Match Conductor's Feel

### Theme Overhaul

Conductor's dark theme is warm, not cold grey. Based on the screenshot:

```css
/* Conductor-inspired warm dark theme */
--bg:           #1a1a1a;     /* warm dark, not pure grey */
--bg-2:         #222222;     /* slightly lighter */
--bg-3:         #2a2a2a;     /* cards, inputs */
--bg-4:         #333333;     /* hover states */

--text:         #e8e4df;     /* warm white, not pure white */
--text-dim:     #9a9590;     /* warm grey */
--text-dimmer:  #6a6560;     /* muted warm */

--border:       rgba(255, 248, 240, 0.08);  /* warm border */
--border-dim:   rgba(255, 248, 240, 0.04);

--accent:       #d4956a;     /* warm amber/terra cotta */
--accent-dim:   #b07a52;
--green:        #7dba6a;     /* muted green for success/additions */
--red:          #d46a6a;     /* muted red for errors/deletions */
```

### Typography
- Monospace: JetBrains Mono (keep)
- UI: Inter or system-ui (keep)
- Conductor uses slightly tighter line-height and more compact spacing

### Message Rendering Upgrade

**Tool Call Cards (match Conductor):**
```
+----------------------------------------------+
| [icon] Read 100 lines  [file.md]        13.6s|
+----------------------------------------------+
```
- Left: tool icon (file, terminal, search, etc.)
- Middle: action + target as inline text
- Right: file badge as pill + elapsed time
- Background: slightly elevated card (--bg-3)
- Border: subtle left accent line in tool color

**Thinking Blocks:**
```
+----------------------------------------------+
| (brain) Thinking  This is a large diff...  v |
+----------------------------------------------+
```
- Collapsible with chevron
- Shimmer animation while streaming
- Muted text color (--text-dim)
- Left border: subtle purple/blue accent

**File Badges:**
- Pill-shaped: rounded-full, bg-3, small text
- Icon + filename
- Clickable (future: opens file viewer)

**Code Blocks:**
- Language label top-right
- Copy button top-right (appears on hover)
- Slightly rounded corners
- Background: --bg-2

### Layout Polish

**Titlebar (match Conductor):**
```
[<] [>] | repo-name > branch-name v | [+39] [refresh] [PR] [diff] [terminal] [changes]
```
- Back/forward navigation arrows
- Breadcrumb: repo > branch (clickable)
- Right side: badge counts + action buttons

**Session Tabs:**
- Conductor style: tab bar below titlebar
- Each tab: name + close (x) + streaming dot
- Active tab: bottom border accent
- "+" button at end

**Chat Input Bar (match Conductor exactly):**
```
+----------------------------------------------+
| Ask to make changes, @mention files, /commands|  Cmd+L to focus
+----------------------------------------------+
| * Opus 4.6 v | lightning | (brain) Thinking | Plan | [+] [mic] [send] |
+----------------------------------------------+
```
- Input field: full width, min 1 line, grows to max 6 lines
- Below input: model picker + thinking toggle + plan toggle + action buttons
- "Cmd+L to focus" hint on right side of input
- Send button: arrow-up icon, accent color when input has text

---

## Execution Order

### Week 1: Visual Parity
1. Warm dark theme (CSS token overhaul)
2. Tool call card redesign (match Conductor's rendering)
3. Thinking block redesign (collapsible + shimmer)
4. Chat input bar redesign (match Conductor's two-line layout)
5. Message rendering polish (file badges, elapsed times, code blocks)
6. Titlebar breadcrumb polish

### Week 2: Architecture Upgrade
7. Replace CLI spawning with Anthropic SDK direct calls
8. Build tool execution engine (bash, read, write, edit, glob, grep)
9. Add WebSocket for bidirectional communication
10. Structured message blocks (store as typed JSON)

### Week 3: Conductor Features
11. Inline tool approval UI
12. Real-time plan mode toggle
13. Compaction status in UI
14. Per-message token display
15. Session notes (Conductor has notes column)
16. Diff comments (line-level review)

---

## What This Gets Us

After 3 weeks:
- Hashmark FEELS like Conductor (warm, dense, interactive)
- Hashmark has native tool execution (no CLI spawning)
- Hashmark has bidirectional RPC (real-time events)
- Hashmark has inline tool approval
- Hashmark STILL has our unique features on top:
  - Codebase scanning + context generation
  - Agent team generation (15-25 agents from scan)
  - Multi-provider support (Claude, OpenAI, Gemini, DeepSeek, etc.)
  - Agent effectiveness tracking
  - Drift detection
  - Smart model routing
  - Swarm mode (multi-agent parallel execution)

Conductor is a great chat UI for Claude Code. We're building a full agent orchestration platform. But the chat UI should feel just as good.
