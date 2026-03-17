# TOOLS.md -- Founding Engineer Tools

## Codebase

- **Read**: Read any file in the repo
- **Edit**: Make targeted edits to existing files
- **Write**: Create new files when necessary
- **Glob**: Find files by pattern
- **Grep**: Search file contents
- **Bash**: Run shell commands (build, test, lint, typecheck)

## Key Commands

```bash
# Dev
npm run dev          # start Next.js dev server
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit

# Database
npm run db:push      # push schema changes
npm run db:generate  # generate Prisma client
npm run db:studio    # open Prisma Studio

# CLI (packages/cli/)
cd packages/cli && npm run build
cd packages/cli && npm run dev
```

## Paperclip API

Use the Paperclip skill for all coordination:
- Get assignments, checkout tasks, update status, comment on issues
- Create subtasks with parentId and goalId always set
- Escalate blockers to CEO via comment + reassign

## Important Files

- `packages/cli/src/cli.ts` -- CLI entry point
- `packages/cli/src/scanner.ts` -- main scanner orchestration
- `src/app/(dashboard)/` -- web dashboard
- `src/app/(marketing)/` -- landing page
- `src/lib/auth.ts` -- auth (24 dependents, edit carefully)
- `src/lib/db.ts` -- database client (24 dependents, edit carefully)
- `src/lib/scan-worker.ts` -- background scan execution
