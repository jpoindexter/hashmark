export interface Session {
  id: string;
  title: string;
  model: string;
  provider: string;
  status: string;
  system_prompt: string | null;
  project_dir: string;
  created_at: number;
  updated_at: number;
  thinking_enabled?: number;
  thinking_level?: string;
  input_tokens?: number;
  output_tokens?: number;
  notes?: string | null;
  worktree_dir?: string | null;
  token_budget?: number | null;
  freshly_compacted?: number;
  pinned?: number;
  plan_mode?: number;
  fast_mode?: number;
  require_tool_approval?: number;
  message_count?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: Block[] | null;
  created_at: number;
  duration_ms?: number;
  git_checkpoint?: string | null;
  bookmarked?: number;
}

export interface Block {
  type: "text" | "thinking" | "tool_use" | "tool_result" | "compaction";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  isError?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string | null;
  system_prompt: string;
  created_at: number;
}

export interface Template {
  id: string;
  name: string;
  description?: string | null;
  system_prompt?: string | null;
  model?: string | null;
  project_dir?: string | null;
  created_at: number;
}
