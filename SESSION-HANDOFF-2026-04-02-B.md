# Session Handoff -- 2026-04-02 (session B)
**Branch:** feature/shell-redesign | **12 new commits** | **All pushed**

---

## What Got Done This Session

### Design System Foundation
- 80 CSS utility classes added to reset.css (typography, layout, spacing, interactive, surfaces)
- New tokens: letter-spacing scale (5 values), font-weight tokens, missing font-size tokens
- Visual polish: radius bumped (2->3px), shadows lightened, button press refined

### Inline Style Migration
- ALL onMouseEnter/onMouseLeave hover handlers eliminated (124+ instances -> 0)
- Label/uppercase patterns migrated to .label class across 14 files
- Font-weight normalized: 72 instances of 700/500/900 -> 600 (only 2 woff2 loaded)
- 7 shared components converted from inline to CSS classes (IconButton, Modal, ConfirmDialog, Toggle, Badge, ContextMenu, SettingsPrimitives)

### God File Splitting
- GitSidebar.tsx: 1397 -> 258 lines (4 extracted files)
- Governance.tsx: 1301 -> 59 lines (5 extracted files) 
- ChatInputBar.tsx: 1373 -> 829 lines (6 extracted files)
- ChatMessages.tsx: 1328 -> 1102 lines (2 extracted files)
- Company.tsx: 1243 -> 719 lines (2 extracted files)
- Run.tsx: 1098 -> 711 lines (3 extracted files)
- Sessions.tsx: 1135 -> 785 lines (3 extracted files)

### Features
- Dynamic model registry: useModels() hook fetches 40+ models from 12 providers
- Full model picker in chat input with provider groups + Thinking/Plan toggles
- Rail simplified: 8 items -> 5 (Chat, Run, Agents, Git, Generate)

### Full Feature Audit
- 14 pages audited against chat-first vision
- KEEP: Sessions, Agents, Generate, Settings
- MERGE into chat: Home, Run, Swarm, Git, Usage, WorkspaceSetup
- CUT: Company, Governance, Files, History
- OpenCode has 3 pages total. Conductor has ~2.
- Detailed audit saved to memory: project_feature_audit.md

---

## What's Next: Chat-First Restructuring

### The Plan (from OpenCode/Conductor analysis)
OpenCode source at ~/Documents/GitHub/_reference/opencode/

1. **Home = project picker** (like OpenCode's 131-line home.tsx)
2. **Session = chat + inline agent results + file tabs + terminal** (absorbs Run, Swarm, Git)
3. **Agents** = agent definitions (keep as lightweight page)
4. **Generate** = scan + context gen (keep)
5. **Settings** = config (keep)

### Specific Changes Needed
1. Remove board view toggle from Shell.tsx -- chat IS the home screen
2. Run results stream inline into chat as rich cards
3. Agent dispatch via @ mention in chat input
4. Swarm results as expandable threads in conversation
5. Remove pages: Company, Governance, Files, History
6. Remove routes: company, governance, bridge, kairos, inbox, sandbox
7. Remove features: Kairos, Bridge, Inbox, Dream mode
8. Simplify rail to 4 items: Chat, Agents, Generate, Settings

### Still Over 300 Lines (need further splitting)
- ChatInputBar.tsx (829), Sessions.tsx (785), Company.tsx (719), Run.tsx (711)
- ProjectPicker.tsx (1092), CommandPalette.tsx (1060) -- not yet touched
- ChatMessages.tsx (1102), TerminalTabs.tsx (815), SourceControlPage.tsx (735)

### Files Modified This Session
```
client/src/styles/tokens.css         -- new tokens
client/src/styles/reset.css          -- 80 utility classes
client/src/styles/shell.css          -- button press refinement
client/src/components/shell/Rail.tsx  -- simplified navigation
client/src/components/shared/*       -- 7 components converted to CSS
client/src/components/ChatInputBar.tsx -- model picker + split
client/src/components/ChatMessages.tsx -- code rendering + empty state split
client/src/components/chat-input/*    -- 6 extracted picker files
client/src/components/chat/CodeRendering.tsx -- extracted
client/src/components/chat/ChatEmptyState.tsx -- extracted
client/src/components/sidebar/git/*   -- 3 extracted files
client/src/pages/governance/*         -- 5 extracted files
client/src/pages/company/*            -- 2 extracted files
client/src/pages/sessions/*           -- 3 extracted files
client/src/pages/run/*                -- 3 extracted files
client/src/lib/models.ts             -- dynamic model registry
client/src/hooks/useModels.ts        -- model fetching hook
+ 40 files with hover handler / label / font-weight migrations
```
