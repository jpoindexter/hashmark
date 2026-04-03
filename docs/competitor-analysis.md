# Competitor Analysis: AI Coding Desktop Apps
> Generated from live binary analysis + screenshots — March 28, 2026

---

## Quick Summary

| App | Tech | Stage | Core Bet | Closest To |
|-----|------|-------|----------|------------|
| **Warp** | Native Rust + GPU | Mature (v2026.03.25) | AI terminal | Hashmark (terminal-first) |
| **Conductor** | Tauri + Svelte | Active (v0.44) | Claude Code UI | Hashmark (agent UI) |
| **OpenCode** | Tauri + Svelte | Active (v1.3) | Chat wrapper | Cursor web |
| **T3 Code** | Electron + Effect-TS | Very early (v0.0.11) | Thread-based chat | Hashmark (minimal) |
| **Emdash** | Electron + React | Mid-stage (v0.4.37) | Parallel agent orchestration | Nothing else |

---

## 1. Warp

### Tech Stack
- **Runtime**: Native Rust binary (arm64, NOT Electron/Tauri/web)
- **Rendering**: Custom GPU-accelerated renderer (wgpu/Metal) — not a browser WebView
- **Error tracking**: Sentry
- **Version**: 0.2026.03.25 (date-stamped releases, ships daily)

### What It Actually Is
Warp started as a fast terminal. It has evolved into a terminal where AI is a first-class citizen. The terminal IS the product. AI is layered on top, not the other way around.

### UI Layout
```
[tab bar: session tabs + new tab button] [Code review button] [avatar]
┌─────────────────────────────────────────────────────────────────┐
│  left sidebar (icons)  │  terminal output / scrollback          │
│  - recent files        │                                        │
│  - commands            │  $ commands run here                   │
│  - etc                 │  output renders here                   │
│                        │                                        │
│                        │  ─────────────────────────────────    │
│                        │  AI chat input (bottom)                │
│                        │  "Warp anything..."                    │
└─────────────────────────────────────────────────────────────────┘
```

### User Flows
1. **New session modal** — prompts for: start agent conversation / cloud agent / cycle past commands / open code review / autodetect agent prompts
2. **AI chat** — persistent bottom input, answers inline in terminal as blocks
3. **Code review** — dedicated mode, top-right button
4. **Tabs** — multiple terminal sessions as tabs

### Key Features
- GPU-accelerated terminal (fastest render of any of these apps)
- AI input always visible at the bottom
- Cloud agents (Warp-hosted, not your API key)
- "Warp anything" — ask questions about your codebase
- Code review mode (separate dedicated view)
- Past commands browsable as conversations
- Tab management for multiple sessions

### Design Language
- Pure terminal aesthetic — dark, monospace, no chrome
- AI feels native, not bolted-on
- Bottom input doesn't fight the terminal — they coexist
- No file tree, no code editor panel, no IDE chrome

### What Warp Gets Right
Terminal IS the product. AI augments the terminal. No IDE pretension.

### What Warp Gets Wrong
- Cloud lock-in (Warp AI backend, not your model)
- Still fundamentally a terminal — no persistent memory of your project
- No agent coordination — each chat is ephemeral
- Freemium model (AI features require paid tier)

---

## 2. Conductor

### Tech Stack
- **Runtime**: Tauri v2 (Rust backend + WebView frontend) — same stack as hashmark studio
- **Frontend**: Svelte (from binary string analysis)
- **Backend**: 151-line single bundled JS — very thin
- **Version**: 0.44.0

### What It Actually Is
A Claude Code orchestrator. You open a project, it manages Claude Code sessions within that workspace. Left sidebar shows workspaces. Center is the welcome/launch screen. The whole app is essentially a GUI wrapper around `claude` CLI.

### UI Layout
```
┌──────────────────────────────────────────────────────────────────┐
│  Activity               │                                        │
│  Workspaces             │         CONDUCTOR (pixel logo)         │
│  ├── hashmark-v1        │                                        │
│  └── Tauri design port  │   [Open project] [Clone URL] [Quick]   │
│      +563               │                                        │
│                         │         1/295 cities visited           │
│  [help] [settings]      │                                        │
└──────────────────────────────────────────────────────────────────┘
```

### Key Features (from binary analysis)
- Workspace/project management
- Claude Code handler — spawns and manages `claude` CLI processes
- Git diff viewer (`GetWorkspaceDiff`, `getDiff`)
- Terminal output viewer (`GetTerminalOutput`, `getTerminalOutput`)
- Enter/exit review mode
- Diff comments
- PR diff view
- Auto-accept edits toggle (`setClaudeEditAutoAccept`)
- OpenAI key fallback
- Session management
- Collaboration agent tool calls (`collabAgentToolCall`)

### Design Language
- Dark neutral background
- Gamification: "1/295 cities visited" travel metaphor for workspaces
- Big pixel logo on welcome screen — strong brand identity
- Left sidebar for workspace list
- Very minimal chrome

### What Conductor Gets Right
- Workspace-scoped Claude Code management
- Clear project metaphor
- Review mode as first-class concept

### What Conductor Gets Wrong
- Thin product — just a wrapper around `claude` CLI with a prettier face
- No real intelligence or memory layer
- Gamification feels random ("cities visited"??)
- No terminal of its own — depends on Claude Code's terminal

---

## 3. OpenCode

### Tech Stack
- **Runtime**: Tauri v2 (Rust backend + WebView frontend)
- **Frontend**: Svelte (confirmed in binary strings)
- **Backend**: Has embedded **Candle** (Hugging Face Rust ML library) — local model inference
- **Version**: 1.3.0
- **Bundle ID**: ai.opencode.desktop

### What It Actually Is
A polished chat interface for AI coding assistants. Three-pane layout: projects/sessions | chat | review+diff. It can run local models (via Candle) and also connect to Claude, GPT, Gemini. The most polished UI of the group.

### UI Layout
```
┌────────────────┬──────────────────────────────┬──────────────────┐
│ Project        │ conversation                  │ [Review] [+]     │
│ WISP-archive   │                               │                  │
│                │ Second brain idea viability   │ 0 Changes        │
│ [+ New session]│ and timeline evaluation       │                  │
│                │                               │ All files        │
│ [session list] │ • Semantic search             │                  │
│                │ • Chat with brain             │ No changes in    │
│                │ • Projects + auto-surface     │ this session     │
│ Getting started│ • Local SQLite storage        │                  │
│ -----------    │                               │ No changes       │
│ Connect        │ What's next: (numbered list)  │                  │
│ provider       │                               │                  │
│                │ [chat input + image attach]   │                  │
│ Not yet        │ Build · Big Pickle · Default  │                  │
└────────────────┴──────────────────────────────┴──────────────────┘
```

### Key Features
- Project + session management (left sidebar)
- Three-pane: sessions | chat | changes/review
- "Review" mode — dedicated code review state
- Real-time diff view (right panel, "0 Changes")
- "All files" view in right panel
- Multiple model providers (Claude, GPT, Gemini, local)
- Free models available by default
- Image attachment in chat
- Branch/context selector at bottom
- Local model inference via Candle (big differentiator)

### Design Language
- Clean dark neutral — no loud colors
- Three-pane IDE-like but chat-centric
- Bottom status bar shows: Build · Big Pickle (model) · Default (context)
- Minimal iconography
- "Getting started" panel for onboarding

### What OpenCode Gets Right
- Local model support is unique — no API key required
- Clean three-pane layout
- Review mode as first-class citizen
- Svelte = fast and lightweight

### What OpenCode Gets Wrong
- Still another chat wrapper — no persistent project knowledge
- Review panel is static (shows changes per session, not cumulative)
- "Getting started" panel at the bottom of sidebar is awkward UX
- No terminal — you have to leave the app to run things

---

## 4. T3 Code (Alpha)

### Tech Stack
- **Runtime**: Electron (Atom/VS Code base — `AtomApplication`)
- **Frontend**: React (based on Electron shell)
- **Backend**: Effect-TS + @pierre/diffs + SQLite (Bun)
- **Version**: 0.0.11 — extremely early
- **Bundle ID**: com.t3tools.t3code

### What It Actually Is
The earliest alpha of the group. Thread-based AI conversations attached to projects. Built by the T3 Stack (Theo) team. Effect-TS backend for functional programming patterns.

### UI Layout
```
┌──────────────────┬─────────────────────────────────────────────┐
│ T3 Code    ALPHA │ No active thread                            │
│                  │                                             │
│ PROJECTS         │                                             │
│ No projects yet  │                                             │
│                  │  Select a thread or create a new one        │
│                  │  to get started.                            │
│                  │                                             │
│                  │                                             │
│ [Settings]       │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

### Key Features
- Thread-based conversations
- Project management (barely there)
- @pierre/diffs integration (Pierre is a code review platform)
- SQLite persistence via Bun
- Effect-TS for type-safe backend

### Design Language
- White/light background (unusual in this space)
- Extremely minimal — nothing works yet
- Strong "alpha" watermark in header

### What T3 Gets Right
- Thread metaphor is clean
- Effect-TS + Pierre suggests serious technical ambition

### What T3 Gets Wrong
- Nothing exists yet (0.0.11 is barely functional)
- Light background in a terminal-heavy category is a risk

---

## 5. Emdash

### Tech Stack
- **Runtime**: Electron
- **Framework**: `NSPrincipalClass: AtomApplication` — built on VS Code/Positron codebase
- **Frontend**: React + Radix UI + Tailwind CSS + Monaco Editor + xterm.js
- **State**: React Query + SQLite3 + Drizzle ORM
- **Analytics**: PostHog
- **Version**: 0.4.37

### What It Actually Is
The most ambitious product in the group. "A cross-platform Electron app that orchestrates multiple coding agents in parallel." It's built on top of VS Code's shell and adds a parallel multi-agent orchestration layer on top.

### Core Mental Model
**Tasks** with **Worktrees** with **Agents**. Each task gets its own git worktree. Multiple agents can work the same task in parallel. You compare their outputs and approve/reject.

### UI Layout (inferred from strings + package.json)
```
┌──────────────┬──────────────────────────────┬──────────────────┐
│ Tasks        │ Active agent conversation     │ Code viewer      │
│              │                               │ (Monaco editor)  │
│ [Filter]     │  [agent output streams]       │                  │
│ [New task]   │                               │ Terminal         │
│              │  [Worktree terminal]           │ (xterm.js)       │
│ task list    │                               │                  │
│              │ [approve / reject / next]     │ Diff view        │
└──────────────┴──────────────────────────────┴──────────────────┘
```

### Key Features (from binary analysis)
- **Task management** — create, delete, filter, restore tasks
- **Worktrees** — each task gets a git worktree, isolated from main
- **Multi-agent parallel execution** — run multiple agents on same task
- **Compare agents** — see outputs side by side
- **Agent Skills** — reusable skill modules you define
- **MCP server integration** — add custom MCP servers
- **Supported CLIs**: Claude Code, Hermes Agent, Amp Code, Amp CLI
- **Execution settings** — env vars, executable path, custom params per agent
- **Review agent** — dedicated review step with approve/reject
- **Remote project support** — SSH-based remote dev
- **PR integration** — creates PRs for completed tasks
- **Monaco editor** — full VS Code editor embedded
- **xterm.js terminals** — real terminal in each worktree
- **New worktree terminal** — dedicated terminal per task/worktree

### Design Language
- Built on VS Code shell — inherits VS Code chrome
- Radix UI + Tailwind = clean component library
- Dark theme, Monaco/VS Code aesthetic
- Diff glyphs: green for added (#10b981), blue for modified (#3b82f6), red for deleted (#ef4444)

### What Emdash Gets Right
- The parallel agent + worktree model is genuinely novel
- Skills system is sticky — creates lock-in through customization
- Monaco gives you a full code editor embedded
- MCP support is forward-thinking
- Supporting multiple CLI agents (not locked to Claude) is smart

### What Emdash Gets Wrong
- VS Code base = heavy, slow, hundreds of MB
- The mental model is complex — tasks + worktrees + agents + skills is a lot
- Built on Electron + VS Code shell = technical debt from day 1
- No project memory/knowledge layer — agents start from scratch each time
- Parallel agents sounds powerful but most developers can't manage parallel context
- No web interface — desktop only

---

## Feature Matrix

| Feature | Warp | Conductor | OpenCode | T3 Code | Emdash | hashmark |
|---------|------|-----------|----------|---------|--------|----------|
| Terminal | ✅ native GPU | ❌ (delegates) | ❌ | ❌ | ✅ xterm | ✅ xterm |
| AI chat | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sessions/threads | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Git diff view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multiple agents | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Worktrees | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Local models | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| MCP support | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Review mode | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Skills/memory | ❌ | ❌ | ❌ | ❌ | partial | ❌ |
| Project knowledge | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ CLI |
| Code editor | ❌ | ❌ | ❌ | ❌ | ✅ Monaco | ❌ |
| Multi-model | ❌ | partial | ✅ | ❌ | ✅ | ❌ |
| Native/fast | ✅✅✅ | ✅ Tauri | ✅ Tauri | ❌ Electron | ❌ Electron | ✅ Tauri |

---

## Design Comparison

| App | Color | Density | Chrome | Personality |
|-----|-------|---------|--------|-------------|
| Warp | Pure black terminal | Low | None | "Terminal evolved" |
| Conductor | Dark charcoal | Low | Minimal | "Professional + game" |
| OpenCode | Dark neutral | Medium | 3-pane | "Clean chat" |
| T3 Code | White/light | Low | Minimal | "Blank canvas" |
| Emdash | VS Code dark | High | Heavy (VS Code) | "Power tool" |
| hashmark | Near-black neutral | Medium | Rail + panels | "Focused dispatch" |

---

## Where hashmark Fits — Honest Assessment

### What makes hashmark different today
Nothing. Right now hashmark is OpenCode with a different color scheme and a Tauri backend. That's not a product, that's a UI exercise.

### What could make hashmark different
The CLI scanners. hashmark has 20+ analysis scanners that none of these apps have:
- `ast-complexity` — cyclomatic/cognitive/Halstead/MI scores
- `security` — vulnerability patterns
- `anti-patterns` — code smell detection
- `dependencies` — dep graph analysis
- `tokens` — context budget awareness

None of Warp, Conductor, OpenCode, T3, or Emdash have anything like this. They're all wrappers around a chat interface. hashmark's CLI actually knows things about your codebase before you even ask.

### The defensible position
**Briefing agents before they start + auditing them after.** Not during — the other apps have the "during" covered.

"Before" means: the agent starts with a briefing that includes real security findings, complexity hotspots, relevant patterns, and anti-patterns for this specific codebase. Not generic — specific to this repo.

"After" means: when the agent finishes, hashmark audits the output against the same scanners and reports drift, new issues, or improvements.

No one does this. Not Warp, not Emdash with their worktrees, not OpenCode with their review panel.

### The right UI for this
Given what you said your actual workflow is (chat → terminal → files):

1. **Full-width chat** — canvas takes everything, no sessions panel cluttering the left
2. **Terminal drawer** — slides up from bottom when you need it (already built)
3. **Sessions** — accessible from rail, not always visible
4. **Pre-flight panel** — before you send a message to an agent, hashmark's scanners have already surfaced the 3 most relevant findings for your query. This is the feature nobody else has.
5. **Post-run audit** — after the agent finishes, show what changed vs. the baseline

### What to cut
- MissionBar — adds nothing, takes 36px
- ContextPanel — the right side panel has nothing meaningful in it yet
- Sessions panel — move to rail drawer
- Generate page — done (already removed)

### What to build next
1. **Pre-flight context injection** — when you start a conversation, auto-attach the relevant scanner output as context. This is what "briefing agents" actually means as a UX.
2. **Post-run audit view** — after agent stops, run the diff through hashmark scanners and show what got better/worse.
3. **Session restore** — done (just fixed).

---

## Conclusion: Where to Aim

Warp is winning at "terminal + AI." Emdash is the most interesting technical bet but they're building an IDE. OpenCode is polished but undifferentiated.

The white space is: **a focused AI chat workspace that actually knows your codebase.** Not an IDE. Not another chat wrapper. A place where the agent starts every conversation already briefed on your code's security posture, complexity hotspots, and relevant patterns — and audits itself when done.

That's hashmark. Nobody else is building that exact thing.
