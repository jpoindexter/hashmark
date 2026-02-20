# Hashmark Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                    hashmark.md                       │
│                  (Next.js on Vercel)                 │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Landing  │  │  Auth    │  │    Dashboard     │  │
│  │  Page    │  │ (GitHub  │  │  (Repos, Scans,  │  │
│  │          │  │  OAuth)  │  │   Intelligence)  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Stripe   │  │ GitHub   │  │    Scanner       │  │
│  │ Payments │  │   API    │  │   (Single-Pass   │  │
│  │          │  │ (Octokit)│  │    Plugin Engine)│  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Search   │  │  Queue   │  │    Redis         │  │
│  │ (tsvector│  │ (Trigger.│  │ (Rate Limit,     │  │
│  │  + BM25) │  │   dev)   │  │  Cache)          │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │           Prisma + Postgres                 │    │
│  │    (Users, Repos, Scans, Files, Search)     │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

                        │
                        │ Creates workflow file
                        ▼

┌─────────────────────────────────────────────────────┐
│              User's GitHub Repository               │
│                                                     │
│  .github/workflows/hashmark.yml                     │
│       │                                             │
│       │ On push to main:                            │
│       ▼                                             │
│  ┌──────────────────────────────────┐               │
│  │     Hashmark GitHub Action      │               │
│  │                                  │               │
│  │  1. npx hashmark-cli             │               │
│  │  2. Single-Pass Engine Run       │               │
│  │  3. Auto-commit if changed       │               │
│  └──────────────────────────────────┘               │
│                                                     │
│  Output files:                                      │
│  ├── AGENTS.md                                      │
│  ├── CLAUDE.md                                      │
│  ├── .cursorrules                                   │
│  ├── .cursor/rules/project.mdc                      │
│  ├── .github/copilot-instructions.md                │
│  ├── .windsurfrules                                 │
│  └── gemini.md                                      │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

```
hashmark/
├── docs/                      # Product documentation
├── packages/
│   ├── action/                # GitHub Action entry point
│   └── cli/                   # Scanner Engine (Monorepo package)
│       ├── src/
│       │   ├── engine/        # Single-Pass "Visitor" orchestrator
│       │   ├── scanners/      # Modular analysis plugins
│       │   ├── formats/       # Documentation generators
│       │   └── types.ts       # Unified Context IR types
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── (marketing)/       # Public pages
│   │   ├── (dashboard)/       # Auth-required pages
│   │   └── api/
│   │       ├── scan/
│   │       │   └── [repoId]/
│   │       │       └── stream/ # SSE Progress endpoint
│   │       └── webhooks/
│   ├── components/
│   │   ├── dashboard/         # Intelligence UI components
│   │   └── shared/            # Common UI primitives
│   └── hooks/
│       └── use-scan-stream.ts # SSE consumer hook
└── .env.example
```

## Data Flow

### 1. Single-Pass Scanner Engine
Instead of independent parallel scripts, Hashmark uses a **Single-Pass Visitor Engine**:
1. **Traverse**: The `CodebaseVisitor` performs a single sequential pass over the file system.
2. **Dispatch**: For every file, matching content is dispatched to registered `ScannerPlugins` (Components, API, Hooks, etc.).
3. **Analyze**: Plugins perform AST analysis (via `@typescript-eslint/typescript-estree`) and extract metadata.
4. **Consolidate**: All metadata is merged into a unified **Context IR** (Intermediate Representation).
5. **Generate**: Documentation formats are generated from the IR without additional file system access.

### 2. Real-time Progress (SSE)
Dashboard provides a "Live Terminal" experience:
1. **Trigger**: User starts a scan.
2. **Stream**: The client opens an `EventSource` connection to `/api/scan/[repoId]/stream`.
3. **Update**: As the background worker progresses (Cloning → Scanning → Generating), it updates the DB status.
4. **Push**: The SSE route pushes status changes immediately to the UI.

### 3. Intelligence & Grading
1. **Readiness Score**: A 0-100 grade based on codebase compatibility with AI tools.
2. **Complexity Analysis**: AST-based cognitive complexity mapping to recommend AI model effort.
3. **Semantic Mapping**: Cross-plugin relationship tracking (e.g., matching API routes to Database models).

## Security Considerations

- **Memory Safety**: Sequential file processing and a 256KB-per-file size limit prevent Node.js heap OOM errors on large codebases.
- **Credential Protection**: GitHub OAuth tokens stored encrypted; repo access validated against GitHub permissions.
- **Privacy**: No source code is stored on Hashmark servers — only the extracted metadata IR and generated context files.
- **Temp Cleanup**: Temporary clone directories are aggressively purged after scan completion.
