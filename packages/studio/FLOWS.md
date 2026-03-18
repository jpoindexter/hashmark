# Hashmark Studio — User Flows

## What hashmark studio is

A local Electron app that turns your codebase into a running AI software company.
The CLI scans your code and generates agents. The Studio is where you direct those agents,
chat with Claude about your project, and see everything happening in real time.

---

## Layout Direction

**Current**: Chat is a right-side panel (narrow, always visible)
**Needed**: Chat lives at the bottom, full-width — like Cursor's composer or Claude Code itself.
Main content (file browser, agent grid, etc.) fills the upper area.
Chat input is always accessible at the bottom. History opens upward on demand.

```
┌─────────────────────────────────────────────────────────────┐
│ [52px icons] [220px workspace sidebar] [main content area]  │
│                                                             │
│                      main view                              │
│                  (agents / files / git)                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [chat history — expands upward when active]                 │
├─────────────────────────────────────────────────────────────┤
│ * Sonnet 4.6  🧠 Thinking  📋 Plan    ○  +  ↑             │
└─────────────────────────────────────────────────────────────┘
```

---

## Flow 1: First Launch / Onboarding

**Entry**: User opens hashmark studio for the first time

1. Studio opens with a "Select Project" screen
2. User picks a local directory (or it opens to cwd if launched via CLI: `hashmark studio`)
3. Studio reads the directory — checks for `.claude/agents/`, `CLAUDE.md`, `AGENTS.md`
4. If no agents found → empty state with CTA: "Run your first scan"
5. If agents exist → goes straight to the dashboard (Home)

**Empty state copy**: "No agents yet. Run a scan to build your AI software company."

**Missing today**: Project picker on launch, persist last-opened project, detect existing scan results

---

## Flow 2: Scan Codebase (hashmark's core job)

**Entry**: User clicks "Generate Agents" or runs scan from toolbar

1. Studio calls `hashmark scan` on the project directory
2. Shows live progress: files scanned, complexity analyzed, patterns detected
3. Scan completes → shows summary: X files, X lines, top languages, complexity score
4. Prompts: "Which tools do you want to generate agents for?"
   - Claude Code (AGENTS.md)
   - Cursor (.cursorrules)
   - Windsurf (.windsurfrules)
   - OpenAI Codex (codex.md)
   - All of the above
5. Generates context files → shows what was created/updated
6. Navigate to Agents view to review the results

**Missing today**: Live scan progress UI, tool selection step, scan results summary, re-scan diff (what changed vs last scan)

---

## Flow 3: Review + Edit Agents

**Entry**: After scan, or clicking Agents in sidebar

1. See all agents grouped by department (engineering, product, design, etc.)
2. Click any agent to open detail panel
3. See: name, description, full system prompt, which tool it's for
4. Edit the system prompt inline — click Save
5. "Run this agent" button opens it in a terminal session
6. Can delete or duplicate agents

**Missing today**: "Run this agent" button, per-agent task history, which tool each agent targets, agent performance metrics

---

## Flow 4: Chat with Claude about the codebase

**Entry**: Bottom chat bar is always visible

1. User types a question in the bottom input bar
2. Model selector shows current model (Sonnet 4.6 default)
3. Claude responds with codebase context injected automatically (from last scan)
4. Response appears inline — expands the chat history area upward
5. Subsequent messages continue the thread
6. Keyboard shortcut to open full-screen chat history: ⌘K or ⌘⇧C
7. "New chat" starts a fresh session
8. Sessions list shows history of past conversations

**Context Claude gets automatically**:
- Project name, language breakdown
- CLAUDE.md / AGENTS.md contents
- Current file open in explorer (if any)
- Current git branch + changed files

**Missing today**: Auto-inject scan context into Claude messages, model selector in input bar, thinking toggle, plan mode toggle, full-screen chat history expansion

---

## Flow 5: Run a Single Agent

**Entry**: Click "Run" on any agent card

1. Agent card shows name, role, status (idle/running)
2. Click Run → opens a task input: "What should this agent do?"
3. User types a task (e.g. "Refactor the auth module to use JWT")
4. Agent launches in a terminal session — bottom panel opens
5. See real-time output: tool calls, file edits, shell commands
6. Agent completes → shows summary: files changed, commands run
7. Git panel updates with the changes

**Missing today**: Per-agent task input, agent status (idle/running/done), task result summary, git diff of agent's changes

---

## Flow 6: Multi-Agent — Software Company Mode

**Entry**: "Run Company" button on Home, or from Agents view

1. User defines a high-level goal: "Build the authentication system"
2. Studio shows which agents will be involved (PM, Frontend Engineer, Backend Engineer, QA)
3. Each agent gets its own workspace/worktree (like Conductor)
4. Parallel execution — see N agents running simultaneously
5. Each agent has its own terminal panel, switchable from sidebar
6. Inter-agent coordination: PM agent creates tickets, engineers implement, QA tests
7. Completion dashboard: what each agent did, total lines changed, test results

**This is the big differentiator** — no other tool does this from a scan of your actual codebase.

**Missing today**: Everything. This is the v2 flagship feature.

---

## Flow 7: File Explorer + Code View

**Entry**: Click Explorer icon in activity bar

1. See project file tree on left (or in workspace sidebar)
2. Click a file → opens in main content area with syntax highlighting
3. Right-click → options: "Ask Claude about this file", "Run agent on this file"
4. When an agent is running, highlight files it's currently editing
5. Diff view: show what changed vs last commit

**Missing today**: Syntax highlighting in viewer, right-click context menu, live agent file highlighting, diff view

---

## Flow 8: Source Control

**Entry**: Click Git icon in activity bar, or git badge in sidebar

1. See all changed files with status (M modified, A added, D deleted)
2. Click a file → see inline diff (green additions, red deletions) — like Conductor's right panel
3. Stage/unstage files
4. Write commit message, commit
5. See recent commit history
6. "Review changes" — ask Claude to review the diff before committing

**Missing today**: Inline diff view, stage/unstage UI, commit from UI, "review with Claude" action

---

## Flow 9: Workspace / Project Management

**Entry**: Left workspace sidebar (like Conductor)

1. Sidebar shows all open projects with: name, git branch, diff stats (+X -Y)
2. Color-coded status: idle / agent running / has changes
3. Click to switch between projects
4. ⌘1/⌘2/⌘3 keyboard shortcuts to jump between workspaces
5. "Add workspace" → file picker → opens new project
6. Each workspace remembers: open files, chat history, terminal sessions

**Missing today**: Multi-workspace support, workspace persistence, per-workspace state

---

## Flow 10: Settings & Configuration

**Entry**: Settings icon in activity bar

1. **Model**: Choose default Claude model (Opus 4.6 / Sonnet 4.6 / Haiku 4.5)
2. **API Key**: Set Anthropic API key (or use env var)
3. **Scan config**: Which directories to scan, depth limits, ignored patterns
4. **Agent generation**: Which tools to generate for by default
5. **Custom rules**: Add project-specific rules for the scan (e.g., "always check for SQL injection")
6. **Keybindings**: Override default shortcuts

**Missing today**: API key management UI, scan config form, custom rules editor (basic), model selection persistence

---

## Flow 11: Terminal

**Entry**: ⌃` or terminal icon in activity bar

1. Opens a full PTY terminal in the bottom panel
2. Pre-seeded with the project directory as cwd
3. Multiple terminal tabs
4. Can run `hashmark scan`, git commands, npm scripts
5. When agent is running, its terminal is a tab here
6. Big terminal mode: fills entire workspace (like Conductor's maximize)

**Mostly built** — needs multiple tabs, agent terminal integration

---

## Priority Order

### Now (MVP gaps)
1. **Chat layout** — move to bottom, full width, expand on demand
2. **Model selector + thinking toggle** in chat input bar
3. **Workspace sidebar** with current project + git stats
4. **Inline diff view** in git panel

### Next (post-MVP)
5. **Run agent** flow end-to-end (task → terminal → summary)
6. **Scan progress UI** (live output during scan)
7. **Context injection** — auto-inject CLAUDE.md into chat
8. **File viewer** with syntax highlighting

### Later (v2 / moat)
9. **Multi-agent / software company mode**
10. **Worktree-per-agent** (parallel isolated execution)
11. **Multi-workspace** support

---

## Open Questions

- Do we support remote projects (SSH into a server)?
- Is the Studio always the primary entry point, or does CLI remain primary and Studio is optional?
- What's the relationship between Studio sessions and Claude Code sessions? Are they the same?
- Multi-agent orchestration: do we build our own coordinator or wrap Claude Code multi-agent?
