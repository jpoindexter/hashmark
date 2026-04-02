export interface AgentDef {
  id: string;
  name: string;
  description: string;
}

export interface Subtask {
  id: number;
  title: string;
  description: string;
  agentId: string;
}

export type Phase = "idle" | "planning" | "planned" | "running" | "merging" | "done";
export type WorkerStatus = "pending" | "running" | "done" | "error" | "conflict";

export interface WorkerState {
  id: number;
  title: string;
  agentId: string;
  agentName: string;
  status: WorkerStatus;
  output: string;
  error?: string;
  verifying?: boolean;
  testPassed?: boolean;
  testOutput?: string;
  testSkipped?: boolean;
}

export interface MergeResult {
  merged: number[];
  conflicts: number[];
  skipped: number[];
}

export interface RunRecord {
  id: string;
  task: string;
  status: 'running' | 'done' | 'error';
  worker_count: number;
  merged_count: number;
  conflict_count: number;
  skipped_count: number;
  created_at: number;
  completed_at: number | null;
  workers: {
    worker_id: number;
    title: string;
    agent_id: string;
    agent_name: string;
    status: string;
    output: string;
    error: string | null;
  }[];
}

export type FailureType = "COMPILE_ERROR" | "TEST_FAIL" | "MERGE_CONFLICT" | "TIMEOUT" | "PERMISSION" | "GIT_ERROR" | "UNKNOWN";

export interface FailureClassification {
  type: FailureType;
  color: string;
}

export interface ParsedOutput {
  files: string[];
  commands: string[];
  lineCount: number;
  keySummary: string;
}
