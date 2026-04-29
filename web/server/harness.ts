import { loadProjectRules } from "./rules.js";
import { runClaudeCli } from "./harness-cli.js";
import { runDirectApi } from "./harness-api.js";

export interface WsMessage {
  type: "text" | "thinking" | "tool_use" | "tool_result" | "tool_approval" | "error" | "done" | "budget_exceeded" | "compaction" | "plan_update" | "new_session";
  text?: string;
  content?: string;
  summary?: string;
  tool?: string;
  input?: Record<string, unknown>;
  toolUseId?: string;
  isError?: boolean;
  error?: string;
  usage?: { input_tokens: number; output_tokens: number };
  tokensUsed?: number;
  budget?: number;
  tasks?: unknown[];
  sessionId?: string;
}

export interface AgentTurnOpts {
  sessionId: string;
  message: string;
  model: string;
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  systemPrompt: string;
  projectDir: string;
  dataDir: string;
  thinkingBudget?: number;
  tokenBudget?: number;
  signal?: AbortSignal;
  send: (data: WsMessage) => void;
  onApproval?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
}

export async function runAgentTurn(opts: AgentTurnOpts): Promise<void> {
  const provider = opts.provider ?? "claude";

  const projectRules = loadProjectRules(opts.projectDir);
  const effectiveOpts = projectRules
    ? { ...opts, systemPrompt: `${projectRules}\n\n---\n\n${opts.systemPrompt ?? ""}` }
    : opts;

  if (provider === "claude" || provider === "anthropic") {
    return runClaudeCli(effectiveOpts);
  }

  return runDirectApi(effectiveOpts);
}

export { runClaudeOnce } from "./harness-cli.js";
