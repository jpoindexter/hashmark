export interface PolicyRule {
  type: "block" | "warn" | "require";
  pattern: string;
  message: string;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  scope: string;
  rules: PolicyRule[];
  enabled: number;
  created_at: number;
}

export interface AgentAction {
  id: number;
  session_id: string | null;
  agent_id: string | null;
  action_type: string;
  target: string | null;
  outcome: string;
  policy_id: string | null;
  created_at: number;
}

export interface Summary {
  total: number;
  blocked: number;
  flagged: number;
  byType: { action_type: string; count: number }[];
  recentBlocked: AgentAction[];
}

export interface JournalEvent {
  timestamp: number;
  runId: string;
  agentId: string;
  workerId?: number;
  action: string;
  target: string;
  outcome: "success" | "failure" | "skipped";
  detail?: string;
}
