export interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
  content: string;
}

export interface AgentStats {
  totalRuns: number;
  successRate: number;
  lastRun: number | null;
}

export type RunStatus = "idle" | "starting" | "running" | "done" | "error" | "stopped" | "interrupted";

export type RunAction =
  | { type: "START" } | { type: "FIRST_CHUNK" } | { type: "DONE" }
  | { type: "ERROR" } | { type: "STOP" } | { type: "INTERRUPT" } | { type: "RESET" };

export const VALID_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  idle:        ["starting"],
  starting:    ["running", "error", "stopped"],
  running:     ["done", "error", "stopped", "interrupted"],
  done:        ["idle"],
  error:       ["idle"],
  stopped:     ["idle"],
  interrupted: ["idle"],
};

export function runStatusReducer(state: RunStatus, action: RunAction): RunStatus {
  const next: RunStatus =
    action.type === "START"        ? "starting" :
    action.type === "FIRST_CHUNK"  ? "running" :
    action.type === "DONE"         ? "done" :
    action.type === "ERROR"        ? "error" :
    action.type === "STOP"         ? "stopped" :
    action.type === "INTERRUPT"    ? "interrupted" :
    action.type === "RESET"        ? "idle" : state;

  return VALID_TRANSITIONS[state].includes(next) ? next : state;
}

export type RecentTrend = "improving" | "stable" | "degrading" | "insufficient_data";

export interface EffectivenessData {
  agentId: string;
  totalRuns: number;
  successRate: number;
  recentTrend: RecentTrend;
  recentSuccessRate: number;
  avgOutputLength: number;
  lastRun: number | null;
}

export type SecurityFinding = {
  agentId: string;
  agentName: string;
  severity: "critical" | "high" | "medium";
  category: "secret" | "tracking" | "prompt-injection" | "exfiltration";
  message: string;
  line: number;
  snippet: string;
};

export type SortKey = "name" | "lastRun" | "runCount";

export type CheckStatus = "pass" | "warn" | "error";

export type SkillCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};
