# Hashmark Scanners — Technical Reference

## Overview

Hashmark uses hashmark's 28 specialized scanners to extract comprehensive metadata from any codebase. Each scanner focuses on one dimension of the codebase and produces structured data that feeds into the context file generators.

All scanners run in parallel for maximum speed. A typical scan of a 1500-file codebase completes in 5-15 seconds.

**Source**: `/Users/jasonpoindexter/Documents/GitHub/_active/hashmark/src/scanners/`

---

## Scanner Inventory

### 1. Components Scanner (`components.ts`)
**What it finds**: React/Vue/Svelte components in `.tsx`, `.jsx`, `.vue` files

**Extracts**:
- Component name and file path
- Import path (for barrel exports)
- Export type (default, named)
- Props with types
- JSDoc description
- Complexity metrics (lines, branches, dependencies)
- Whether it's a client component (`"use client"`)

**Why it matters**: AI tools create duplicate components when they don't know what exists. This scanner builds the complete component inventory.

### 2. Variants Scanner (`variants.ts`)
**What it finds**: CVA (class-variance-authority) variant configurations

**Extracts**:
- Component name
- Variant names and options (e.g., Button: size = sm/md/lg, variant = default/destructive/outline)
- Default variant values

**Why it matters**: Without variant info, AI generates `className="bg-red-500 text-white"` instead of `<Button variant="destructive">`.

### 3. Dependencies Scanner (`dependencies.ts`)
**What it finds**: Import relationships between components

**Extracts**:
- Which utilities each component imports (cn, clsx, etc.)
- Design system imports (tokens, mode object)
- Radix UI / headless UI imports
- Internal component imports
- External library imports

**Why it matters**: Shows AI which components are "primitives" (no internal deps) vs "composed" (built from other components).

### 4. Barrels Scanner (`barrels.ts`)
**What it finds**: Barrel exports (index.ts re-exports)

**Extracts**:
- Files that re-export from other files
- Clean import paths for consumers
- What each barrel exports

**Why it matters**: Tells AI to use `import { Button } from '@/components/ui'` instead of `import { Button } from '@/components/ui/button'`.

### 5. Tokens Scanner (`tokens.ts`)
**What it finds**: CSS design tokens

**Extracts**:
- CSS variables from `:root` and CSS files
- Tailwind config tokens (colors, spacing, radius, fonts)
- Semantic token names (primary, secondary, muted, etc.)
- Color values with hex codes

**Why it matters**: The #1 AI mistake is hardcoding colors (`bg-blue-500`) instead of using tokens (`bg-primary`). This scanner documents every available token.

### 6. Hooks Scanner (`hooks.ts`)
**What it finds**: Custom React hooks in `hooks/` or `use*.ts` files

**Extracts**:
- Hook name and file path
- Parameters and return types
- Whether it's client-only
- JSDoc description

**Why it matters**: AI often recreates hooks that already exist (e.g., `useLocalStorage`, `useDebounce`).

### 7. API Routes Scanner (`api-routes.ts`)
**What it finds**: API route handlers in Next.js, Express, Fastify

**Extracts**:
- Route path (e.g., `/api/users`)
- HTTP methods (GET, POST, PUT, DELETE)
- Whether route is protected (auth middleware)
- Request schema (Zod validation, if present)
- Response schema (if typed)
- Query parameters

**Why it matters**: AI needs to know existing API contracts to generate correct client-side code.

### 8. API Schema Parser (`ast-schema-parser.ts`)
**What it finds**: Zod validation schemas and TypeScript types in API routes

**Extracts**:
- Schema field names and types
- Validation rules (min, max, email, regex)
- Custom error messages
- Enum values
- Nested object structures

**Why it matters**: AI can see exact API contracts: `POST /api/contact { name: string(max:100), email: string(email), subject: "sales"|"support"|"billing" }`.

### 9. GraphQL Scanner (`graphql.ts`)
**What it finds**: GraphQL schema definitions from `.graphql` and `.gql` files

**Extracts**:
- Type definitions (Query, Mutation, Subscription)
- Input types
- Enum definitions
- Field types and arguments

**Why it matters**: GraphQL APIs have strict schemas that AI must follow exactly.

### 10. Database Scanner (`database.ts`)
**What it finds**: Database schemas (Prisma, Drizzle ORM)

**Extracts**:
- Model/table names
- Field names, types, and constraints
- Relations (one-to-one, one-to-many, many-to-many)
- Indexes and unique constraints
- Enum definitions

**Why it matters**: AI generates wrong field names and relations without database context.

### 11. Environment Variables Scanner (`env-vars.ts`)
**What it finds**: Environment variables from `.env.example` and Zod validation

**Extracts**:
- Variable names
- Whether required or optional
- Default values (if any)
- Description/comments
- Which are public (`NEXT_PUBLIC_*`)

**Why it matters**: Prevents AI from using undefined env vars or exposing private ones in client code.

### 12. Patterns Scanner (`patterns.ts`)
**What it finds**: Code patterns and library usage

**Extracts**:
- Form handling (react-hook-form, Formik)
- Validation (Zod, Yup, Joi)
- State management (Zustand, Redux, Jotai, TanStack Query)
- Testing (Vitest, Jest, Playwright, Cypress)
- ORM (Prisma, Drizzle, TypeORM)
- Authentication patterns

**Why it matters**: AI should follow the project's established patterns, not invent new ones.

### 13. Utilities Scanner (`utilities.ts`)
**What it finds**: Common utility functions and design system patterns

**Extracts**:
- `cn()` utility (Tailwind class merging)
- `mode` / design system object
- shadcn/ui usage (number of Radix packages)
- CVA library presence
- Other utility patterns

**Why it matters**: AI must know to use `cn()` for conditional Tailwind classes, not template literals.

### 14. Framework Scanner (`framework.ts`)
**What it finds**: Framework, language, and key technology versions

**Extracts**:
- Framework name and version (Next.js, Remix, Vite, Express)
- Language (TypeScript/JavaScript) and version
- Router type (App Router, Pages Router)
- Styling solution (Tailwind, CSS Modules, styled-components)
- Key dependency versions (React, Node.js, etc.)

**Why it matters**: AI generates framework-specific code — it needs to know if it's Next.js App Router vs Pages Router.

### 15. Commands Scanner (`commands.ts`)
**What it finds**: npm/yarn/pnpm scripts from package.json

**Extracts**:
- Script name and command
- Category (dev, build, test, lint, db, deploy, custom)

**Why it matters**: AI can suggest the right commands for development tasks.

### 16. Existing Context Scanner (`existing-context.ts`)
**What it finds**: Existing AI documentation files

**Extracts**:
- Presence of CLAUDE.md, AGENTS.md, .cursorrules
- `.ai/` folder and contents
- `.cursorrules` content
- Any other context documentation

**Why it matters**: Avoids overwriting user's custom rules; can merge with existing context.

### 17. File Statistics Scanner (`stats.ts`)
**What it finds**: Overall codebase statistics

**Extracts**:
- Total file count
- Total lines of code
- Total size (bytes/MB)
- Largest files (potential complexity hotspots)
- File count by extension
- Language distribution

**Why it matters**: Gives AI a sense of codebase scale and helps identify large, complex files.

### 18. File Tree Scanner (`file-tree.ts`)
**What it finds**: Project directory structure

**Extracts**:
- Hierarchical file tree visualization
- Directory groupings
- Key directories (src, lib, components, pages, api)

**Why it matters**: AI needs to know where to put new files and how the project is organized.

### 19. Import Graph Scanner (`imports.ts`)
**What it finds**: Import dependency relationships

**Extracts**:
- Hub files (most imported — changes here have wide impact)
- Circular dependencies
- Unused files (potential dead code)
- Import chains

**Why it matters**: AI should be extra careful with hub files and can identify dead code to clean up.

### 20. Types Scanner (`types.ts`)
**What it finds**: TypeScript type exports

**Extracts**:
- Exported types and interfaces
- Props types (component prop definitions)
- API types (request/response shapes)
- Model types (database-related)
- Enum definitions

**Why it matters**: AI should reuse existing types instead of creating new ones.

### 21. Anti-Patterns Scanner (`anti-patterns.ts`)
**What it finds**: Context-aware anti-patterns based on detected stack

**Extracts**:
- WRONG/RIGHT code examples
- Framework-specific anti-patterns (e.g., using `<a>` instead of `<Link>` in Next.js)
- Design system violations (hardcoded colors vs tokens)
- Component anti-patterns (raw HTML vs existing components)

**Why it matters**: These become the "Critical Rules" section — the most impactful part of any context file.

### 22. Tests Scanner (`tests.ts`)
**What it finds**: Test infrastructure and coverage

**Extracts**:
- Test framework (Vitest, Jest, Playwright, Cypress)
- Test file count
- Component test coverage percentage
- Test file locations

**Why it matters**: AI should know where to put tests and which framework to use.

### 23. Security Scanner (`security.ts`)
**What it finds**: Security vulnerabilities (requires `--security` flag)

**Extracts**:
- npm audit results
- Vulnerability count by severity (critical, high, medium, low)
- Outdated packages
- Lock file status

**Why it matters**: AI-generated code should avoid vulnerable dependencies.

### 24. Complexity Scanner (`complexity.ts`)
**What it finds**: Codebase complexity metrics

**Extracts**:
- Cyclomatic complexity per file
- Git churn (frequently changed files)
- Coupling metrics (files with many imports)
- AI model effort recommendations per area
- Complexity score by directory

**Why it matters**: Recommends which areas need the most capable AI model and where to be extra careful.

### 25. Git Scanner (`git.ts`)
**What it finds**: Git history and status

**Extracts**:
- Recent commits (with `--include-git-log`)
- Uncommitted changes (with `--include-diffs`)
- Current branch
- Contributor information

**Why it matters**: Provides recent context about what's actively being worked on.

### 26. Monorepo Scanner (`monorepo.ts`)
**What it finds**: Monorepo structure and packages

**Extracts**:
- Workspace type (npm, yarn, pnpm)
- Package names and paths
- Package dependencies (internal)
- Root vs package scripts

**Why it matters**: In monorepos, AI needs to know which package it's working in and what's available from sibling packages.

### 27. AST Schema Parser (`ast-schema-parser.ts`)
**What it finds**: Deep Zod schema extraction using TypeScript AST

**Extracts**:
- Full Zod schema trees (nested objects, arrays, unions)
- Validation constraints (min, max, regex, email)
- Custom error messages
- Schema references and shared schemas
- 95%+ accuracy using AST parsing instead of regex

**Why it matters**: This is the most advanced scanner — gives AI exact API contracts with validation rules.

### 28. AI Automation Hooks Scanner (`latent-hooks.ts`)
**What it finds**: Context-aware triggers for AI coding assistants.

**Extracts**:
- `session_start`: Setup tasks (e.g., `npm install`)
- `file_edit`: Proactive background tasks (e.g., `npx tsc`, `prettier`, project-specific tests)
- `task_complete`: Post-task validation (e.g., `npm run lint`)
- `file_create`: Architectural constraints (e.g., standard UI primitives folder)

**Why it matters**: Tells the AI *when* to run certain commands, enabling self-healing and proactive validation without manual prompting. Inspired by Latent-K but auto-generated based on the project's specific tech stack.

---

## Scanner Architecture

### Execution Order

1. **Types scanner** runs first (enables schema resolution for other scanners)
2. **All other scanners** run in parallel
3. **Post-processing** runs after all scanners complete:
   - Anti-patterns (needs framework + patterns data)
   - Test coverage (needs component data)
   - Security audit (optional, slow)
   - Complexity analysis (needs import graph data)

### Performance

| Codebase Size | Files | Scan Time |
|---------------|-------|-----------|
| Small (startup) | 50-200 | 2-5 seconds |
| Medium (SaaS) | 200-1000 | 5-15 seconds |
| Large (enterprise) | 1000-5000 | 15-45 seconds |
| Monorepo | 5000+ | 30-120 seconds |

### Output

All scanners produce typed results that conform to the `ScanResult` interface in `types.ts`. The generator (`generator.ts`) transforms these results into each output format.

```typescript
interface ScanResult {
  components: Component[]
  tokens: Tokens
  framework: Framework
  hooks: Hook[]
  utilities: Utilities
  commands: Commands
  existingContext: ExistingContext
  variants: ComponentVariant[]
  apiRoutes: ApiRoute[]
  envVars: EnvVar[]
  patterns: DetectedPatterns
  database: DatabaseSchema | null
  stats: FileStats
  barrels: BarrelExport[]
  dependencies: ComponentDependency[]
  fileTree?: FileTree
  importGraph?: ImportGraph
  typeExports?: TypeScanResult
  antiPatterns?: AntiPatternsResult
  testCoverage?: TestCoverage
  securityAudit?: SecurityAudit
  aiRecommendations?: AIRecommendations
  graphqlSchemas?: Map<string, ApiSchema>
}
```
