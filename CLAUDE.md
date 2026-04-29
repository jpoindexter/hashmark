# CLAUDE.md

## What this is
Local multi-agent harness. Hono server (3200) + Vite/React SPA. SQLite. Opens in browser. No Tauri.

## Product direction
Read `ROADMAP-2026-04-19.md` before starting any session. It defines what v1 is, what's in scope, what's explicitly out of scope, and the 4-phase plan to ship. Don't add features not in v1 scope without checking it first.

## Stack
- Server: Hono + Node, `server/` → `dist/`
- Client: Vite + React SPA, `client/src/` → `dist/public/`
- DB: better-sqlite3, WAL, `.hashmark/studio.db`. 3 tables: `sessions`, `messages`, `agents`
- npm only. Never pnpm.

## Commands
```bash
npm run dev          # server + vite
npm run build:hono   # server only (faster)
npm run typecheck
git commit --no-verify  # always -- 300-line hook
```

## Files (read only what you need)
```
bin.ts              env load, import server
server/index.ts     all routes + auth + rate limit
server/db.ts        schema + migrations
server/harness.ts   runAgentTurn() -- agentic loop
server/stream.ts    streamAIResponse() -- all providers
server/tools.ts     bash/read/write/edit/glob/grep
server/oauth.ts     Claude Code OAuth detection
server/providers.ts provider config load/save
server/token.ts     bearer token gen
server/auth.ts      auth middleware
server/ratelimit.ts sliding window
client/src/components/Shell.tsx      sidebar + settings
client/src/components/ChatPane.tsx   chat + SSE streaming
client/src/components/ToolOutput.tsx tool cards + approval
client/src/lib/api.ts                fetchApi(), apiUrl()
client/src/styles/tokens.css         CSS vars
```

## Rules
- Client: always `fetchApi()` from `lib/api.ts`, never raw `fetch('/api/...')`
- CSS: `var(--token)` from tokens.css, no Tailwind, no hardcoded colors
- Toast: `import { toast } from "../Toasts"` — no local state
- DB: additive migrations only, never DROP, check `PRAGMA table_info` before ALTER TABLE
- Vite SPA — ignore any Next.js / `'use client'` suggestions

## Gotchas (non-obvious, don't skip)
**OAuth header**: OAuth tokens from pi-agent are NOT `sk-` prefixed. `streamClaude()` detects this and sends `Authorization: Bearer` + `anthropic-beta: claude-code-20250219,oauth-2025-04-20`. API keys use `x-api-key`.

**DB on new workspace**: `getDb(dataDir)` runs migrations on first call. Initial `CREATE TABLE` transaction can only reference columns defined in that same statement — no indexes on columns added later via ALTER TABLE.

**Hono middleware order**: auth registered AFTER `/api/health` + `/api/info`. Rate limit BEFORE route registration.

**SSE**: use `new ReadableStream`, always call `controller.close()`. Client reads with `fetch()` + `reader.read()` loop, not EventSource (POST body needed).

## Archive
Old 37K-line codebase: `_archive/2026-04-13/`. Reference only, never import.
