# Hashmark Scanners — Technical Reference

## Overview

Hashmark uses a high-performance **Single-Pass Visitor Engine** to extract comprehensive metadata from any codebase. Instead of multiple independent traversals, a single `CodebaseVisitor` walks the file system and dispatches content to specialized `ScannerPlugins`.

This architecture ensures:
- **Maximum Speed**: A typical 1,500-file codebase (30k+ lines) is scanned in **< 2 seconds**.
- **Memory Safety**: Files are processed sequentially with a strict 256KB-per-file limit to prevent OOM errors.
- **Context IR**: All metadata is consolidated into a unified **Context IR (Intermediate Representation)**.

**Core Package**: `packages/cli/src/engine/`
**Plugins**: `packages/cli/src/scanners/`

---

## Scanner Inventory

### 1. Components Scanner (`components.ts`)
**What it finds**: React/Vue/Svelte components in `.tsx`, `.jsx`, `.vue` files.
**Extracts**: Name, path, export type, props, JSDoc, and whether it's a Server or Client component.
**AI Benefit**: Prevents AI from creating duplicate components.

### 2. Tokens Scanner (`tokens.ts`)
**What it finds**: CSS variables and Tailwind design tokens.
**Extracts**: Colors, spacing, radius, fonts, and semantic token names (primary, muted, etc.).
**AI Benefit**: Stops AI from hardcoding colors like `bg-blue-500` instead of using `bg-primary`.

### 3. API Routes Scanner (`api-routes.ts`)
**What it finds**: Next.js App/Pages router handlers and Express/Fastify routes.
**Extracts**: Path, HTTP methods, auth status, and Zod/TypeScript schemas.
**AI Benefit**: Provides exact API contracts for generating correct client-side fetching logic.

### 4. Database Scanner (`database.ts`)
**What it finds**: Prisma and Drizzle ORM schemas.
**Extracts**: Model names, fields, relations, and enums.
**AI Benefit**: Ensures AI-generated database queries use correct field names and relations.

### 5. Complexity Scanner (`complexity.ts`)
**What it finds**: Cognitive complexity hotspots via AST analysis.
**Extracts**: Per-function cognitive/cyclomatic scores and git churn (frequently changed files).
**AI Benefit**: Recommends which files require high-capability AI models (e.g., Claude 3.5 Sonnet) vs faster models.

### 6. AI Readiness Scanner (`ai-readiness.ts`)
**What it finds**: Codebase suitability for AI documentation.
**Extracts**: A 0-100 grade based on:
- Documentation coverage
- Type safety (TypeScript usage)
- Modularization
- Testing coverage
- Existing context presence
**AI Benefit**: Provides actionable tips to improve the codebase for AI assistant compatibility.

### 7. Latent Hooks Scanner (`latent-hooks.ts`)
**What it finds**: Context-aware triggers for AI automation.
**Extracts**: Standard commands for `session_start`, `file_edit` (TSC/Lint), and `task_complete`.
**AI Benefit**: Enables AI tools to proactively validate code changes (e.g., running `npm test` after editing a file).

### 8. Hooks Scanner (`hooks.ts`)
**What it finds**: Custom React hooks (`use*.ts`).
**Extracts**: Name, params, return types, and JSDoc.
**AI Benefit**: Prevents AI from reinventing standard hooks already in the project.

### 9. Stats Scanner (`stats.ts`)
**What it finds**: codebase scale metrics.
**Extracts**: Total files, lines of code, and language distribution.
**AI Benefit**: Calibrates AI context window usage based on project size.

### 10. Git Scanner (`git.ts`)
**What it finds**: Recent history and active changes.
**Extracts**: Recent commits and current git diffs.
**AI Benefit**: Provides "immediate history" so the AI knows what you just changed.

---

## Engine Architecture

### The Visitor Pattern
The `ScannerEngine` uses a `CodebaseVisitor` to traverse the project root. For every file:
1. **Match**: `ScannerRegistry` identifies which plugins are interested based on `filePatterns` (glob).
2. **Dispatch**: File content is passed to `onFile(path, content)`.
3. **Finalize**: After traversal, `finalize()` is called on all plugins to resolve cross-file relationships (e.g., mapping Hooks to Components).

### Performance Metrics (Root Scan)

| Repo Size | Total Files | Lines of Code | Scan Time |
|-----------|-------------|---------------|-----------|
| Small     | ~100        | 5,000         | 0.4s      |
| Medium    | ~500        | 45,000        | 1.2s      |
| Large     | ~2,000      | 150,000       | 3.8s      |

### Output Formats
The `ScanResult` IR is fed into diverse format generators:
- `AGENTS.md`: Universal context.
- `CLAUDE.md`: Claude Code optimized.
- `.cursorrules`: Cursor IDE rules.
- `gemini.md`: Gemini CLI context.
- `.windsurfrules`: Windsurf Flow.
