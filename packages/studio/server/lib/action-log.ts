import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface AgentActionEvent {
  timestamp: number;
  runId: string;
  agentId: string;
  workerId?: number;
  action: "file_write" | "file_read" | "bash_exec" | "git_commit" | "git_merge" | "test_run" | "worktree_create" | "worktree_remove";
  target: string;
  outcome: "success" | "failure" | "skipped";
  detail?: string;
}

export function logAgentAction(dataDir: string, event: AgentActionEvent): void {
  try {
    mkdirSync(dataDir, { recursive: true });
    const line = JSON.stringify(event) + "\n";
    appendFileSync(join(dataDir, "agent-actions.jsonl"), line);
  } catch { /* never throw */ }
}

export function parseActionsFromOutput(output: string, runId: string, agentId: string, workerId?: number): AgentActionEvent[] {
  const events: AgentActionEvent[] = [];
  const now = Date.now();

  // Detect file writes: Edit/Write/Create patterns in Claude output
  const writeRe = /(?:(?:Edit|Write|Create|Updated?|Modified?|Created?|Writing to|Editing)\s+[`']?)([\w./\-]+\.(?:ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|css|html|sh|env))/gi;
  for (const m of output.matchAll(writeRe)) {
    events.push({ timestamp: now, runId, agentId, workerId, action: "file_write", target: m[1], outcome: "success" });
  }

  // Detect bash commands
  const bashRe = /\$\s+((?:npm|npx|yarn|pnpm|git|python|node|tsc|eslint|jest|vitest|cargo|go)\s+[\w\s\-./]+)/g;
  for (const m of output.matchAll(bashRe)) {
    events.push({ timestamp: now, runId, agentId, workerId, action: "bash_exec", target: m[1].trim().slice(0, 120), outcome: "success" });
  }

  return events;
}
