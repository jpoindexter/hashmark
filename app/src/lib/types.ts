export interface Session {
	id: string;
	title: string;
	agent_id: string | null;
	model: string | null;
	provider: string | null;
	project_path: string | null;
	worktree_path: string | null;
	trust_level: 'ask' | 'auto_shell' | 'auto_all';
	pinned: boolean;
	color?: string | null;
	parent_session_id?: string | null;
	forked_from_message_id?: string | null;
	created_at: number;
	updated_at: number;
}

export interface Message {
	id: string;
	session_id: string;
	role: 'user' | 'assistant' | 'tool' | 'system';
	content: string;
	tool_name: string | null;
	tool_input: string | null;
	input_tokens?: number;
	output_tokens?: number;
	checkpoint_sha?: string | null;
	created_at: number;
}

export interface Agent {
	id: string;
	name: string;
	system: string;
	model: string;
	provider: string;
	max_tokens?: number;
}

export interface ProviderInfo {
	id: string;
	label: string;
	has_key: boolean;
}

export interface DirEntry {
	name: string;
	path: string;
	is_dir: boolean;
	size: number;
}

export interface Issue {
	id: string;
	title: string;
	body: string;
	status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
	priority: 'low' | 'medium' | 'high';
	due_date?: string | null;
	created_at: number;
	updated_at: number;
}

export interface SearchResult {
	session_id: string;
	session_title: string;
	message_id: string;
	role: string;
	snippet: string;
}

export interface Routine {
	id: string;
	name: string;
	message: string;
	agent_id: string | null;
	schedule: 'manual' | 'daily' | 'weekly';
	last_run_at: number | null;
	created_at: number;
}

export type McpTransportKind = 'stdio' | 'http';

export type McpAuthConfig =
	| { type: 'none' }
	| { type: 'bearer'; token: string }
	| {
		type: 'oauth';
		scopes?: string[];
		metadata?: { authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string | null; scopes_supported?: string[] } | null;
		client?: { client_id: string; client_secret?: string | null } | null;
		tokens?: { access_token: string; refresh_token?: string | null; expires_at?: number | null; token_type: string } | null;
	};

export interface McpServerConfig {
	id: string;
	name: string;
	transport?: McpTransportKind;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	auth?: McpAuthConfig;
	enabled: boolean;
}

export interface McpServerStatus {
	config: McpServerConfig;
	running: boolean;
	tool_count: number;
	error: string | null;
}
