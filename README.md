# hashmark

Run multiple Claude Code agents in parallel from a single UI.

The current state of the art for multi-agent work is tmux — a terminal split into rectangles, each showing a different agent's output. Hashmark is the orchestration layer on top of what already works.

**Status: beta — Mac only**

---

## What it does

- Start 2+ Claude Code sessions on different tasks or directories simultaneously
- Watch tool calls stream in real-time with inline approve/deny
- Sessions persist across restarts
- OAuth-native — if you have Claude Max, you're already authenticated. No API key setup.

---

## Prerequisites

- macOS 13+
- [Claude Code CLI](https://claude.ai/code) installed and authenticated (`claude` in your PATH)
- Node 20+
- Rust + Cargo ([install](https://rustup.rs))

---

## Run in development

```bash
git clone https://github.com/jpoindexter/hashmark.git
cd hashmark/app
npm install
npm run tauri dev
```

The app opens as a native macOS window. Vite serves the frontend at `localhost:5173`.

---

## Build a DMG

```bash
cd app
npm run tauri build
```

Output: `app/src-tauri/target/release/bundle/dmg/hashmark_*.dmg`

---

## Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 |
| Frontend | Svelte 5 + SvelteKit (SPA, adapter-static) |
| Backend | Rust + SQLite (tauri-plugin-sql) |
| Agent runner | Claude Code CLI subprocess |
| Styling | Pure CSS custom properties, no Tailwind |

---

## How it works

Each session spawns a Claude Code process via Tauri's Rust backend. The process streams JSON tool-call events back to the UI over a Tauri event channel. The frontend renders them as flat approval rows — you see what each agent is doing and can allow or deny tool calls inline. All sessions and messages are persisted in a local SQLite database.

API keys are stored in Tauri's secure OS keychain, never in source or config files.

---

## Project layout

```
app/
  src/                    Svelte 5 frontend
    routes/+page.svelte   shell layout (titlebar, tab bar, sidebar)
    components/           ChatPane, Compose, Sidebar, Welcome, Settings, ...
    lib/                  store, api, types
  src-tauri/src/          Rust backend
    commands.rs           Tauri command handlers
    harness.rs            agent runner + streaming
    db.rs                 SQLite schema + queries
    sessions.rs           session management
  static/                 fonts (Roboto, Hack), icons
```

---

## Key commands

```bash
npm run tauri dev        # dev mode (hot reload)
npm run tauri build      # production DMG
npm run check            # Svelte + TypeScript typecheck
```

---

## Roadmap

- [x] Multi-session parallel agents
- [x] Real-time tool call streaming
- [x] Inline approve/deny
- [x] Session persistence
- [x] OAuth-native auth (Claude Max)
- [ ] Per-session cost/token tracking
- [ ] Workflow chains (agent A hands off to agent B)
- [ ] Session checkpoints + branching
- [ ] Multi-provider (OpenAI, Gemini, Ollama)

---

## License

MIT
