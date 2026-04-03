# HEARTBEAT.md -- Founding Engineer Heartbeat Checklist

Run this on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` -- confirm id, role, budget, chainOfCommand.
- Check: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Local Planning Check

1. Read today's plan from `$AGENT_HOME/memory/YYYY-MM-DD.md`.
2. Review in-progress tasks: what's done, what's blocked, what's next.
3. Resolve blockers or escalate to CEO.

## 3. Approval Follow-Up

If `PAPERCLIP_APPROVAL_ID` is set, review the approval and act on it.

## 4. Get Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`
- Prioritize: `in_progress` first, then `todo`.
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that.

## 5. Checkout and Work

- Always checkout before working: `POST /api/issues/{id}/checkout`.
- Never retry a 409 -- that task belongs to someone else.
- Do the work. Run typecheck + lint. Update status and comment when done.

## 6. Before Closing Any Task

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] New API routes have Zod validation
- [ ] No hardcoded secrets or API keys
- [ ] No `any` types introduced

## 7. Exit

- Comment on any in-progress work before exiting.
- If no assignments and no valid mention-handoff, exit cleanly.

---

## Founding Engineer Responsibilities

- **Execution**: Build what's on the roadmap. Write clean, working code.
- **Architecture**: Own technical decisions. Flag anything that changes scope to CEO.
- **Quality gate**: Nothing ships without typecheck + lint passing.
- **Unblocking**: Investigate your own blockers first (3 attempts). Then escalate.
- **Never take unassigned work** -- only work on what is assigned.
