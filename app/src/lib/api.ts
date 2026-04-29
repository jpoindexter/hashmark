import { invoke } from '@tauri-apps/api/core';
import type { Session, Message, Agent, ProviderInfo, DirEntry, Issue, Routine, SearchResult, McpServerConfig, McpServerStatus } from './types';

export const api = {
	// Sessions
	listSessions: () => invoke<Session[]>('list_sessions'),
	createSession: (args?: { title?: string; agent_id?: string; model?: string; provider?: string; project_path?: string }) =>
		invoke<Session>('create_session', { args: args ?? {} }),
	getMessages: (session_id: string) => invoke<Message[]>('get_messages', { sessionId: session_id }),
	deleteSession: (session_id: string) => invoke<void>('delete_session', { sessionId: session_id }),
	renameSession: (session_id: string, title: string) =>
		invoke<void>('rename_session', { sessionId: session_id, title }),
	pinSession: (session_id: string, pinned: boolean) =>
		invoke<void>('pin_session', { sessionId: session_id, pinned }),
	setSessionColor: (session_id: string, color: string | null) =>
		invoke<void>('set_session_color', { sessionId: session_id, color }),

	// Agents
	listAgents: () => invoke<Agent[]>('list_agents'),
	createAgent: (args: { name: string; system: string; model: string; provider: string; max_tokens?: number }) =>
		invoke<Agent>('create_agent', { args }),
	updateAgent: (agent_id: string, args: { name: string; system: string; model: string; provider: string; max_tokens?: number }) =>
		invoke<void>('update_agent', { agentId: agent_id, args }),
	deleteAgent: (agent_id: string) =>
		invoke<void>('delete_agent', { agentId: agent_id }),

	// Providers & API keys
	listProviders: () => invoke<ProviderInfo[]>('list_providers'),
	getApiKey: (provider: string) => invoke<string | null>('get_api_key', { provider }),
	setApiKey: (provider: string, key: string) => invoke<void>('set_api_key', { provider, key }),
	listOllamaModels: () => invoke<string[]>('list_ollama_models'),

	updateSession: (session_id: string, args: { model: string; provider: string }) =>
		invoke<void>('update_session', { sessionId: session_id, model: args.model, provider: args.provider }),

	// AI
	streamMessage: (session_id: string, content: string, opts?: { temperature?: number; maxTokens?: number; globalSystemPrompt?: string }) =>
		invoke<string>('stream_message', {
			sessionId: session_id,
			content,
			temperature: opts?.temperature ?? null,
			maxTokens: opts?.maxTokens ?? null,
			globalSystemPrompt: opts?.globalSystemPrompt ?? null,
		}),

	// Tool approval
	approveTool: (tool_id: string, approved: boolean) =>
		invoke<void>('approve_tool', { toolId: tool_id, approved }),
	alwaysAllowTool: (permission_key: string) =>
		invoke<void>('always_allow_tool', { permissionKey: permission_key }),
	revokeToolPermission: (permission_key: string) =>
		invoke<void>('revoke_tool_permission', { permissionKey: permission_key }),
	listAlwaysAllowed: () => invoke<string[]>('list_always_allowed'),

	// File system
	listDir: (path: string) => invoke<DirEntry[]>('list_dir', { path }),
	getHomeDir: () => invoke<string>('get_home_dir'),
	readFile: (path: string) => invoke<string>('read_file', { path }),
	writeFile: (path: string, content: string) => invoke<void>('write_file', { path, content }),
	createDir: (path: string) => invoke<void>('create_dir', { path }),
	renameFile: (from: string, to: string) => invoke<void>('rename_file', { from, to }),
	deletePath: (path: string, recursive: boolean) => invoke<void>('delete_path', { path, recursive }),

	// Issues
	listIssues: () => invoke<Issue[]>('list_issues'),
	createIssue: (args: { title: string; body: string; priority: string; due_date?: string | null }) =>
		invoke<Issue>('create_issue', { args }),
	updateIssue: (issue_id: string, args: { title: string; body: string; status: string; priority: string; due_date?: string | null }) =>
		invoke<void>('update_issue', { issueId: issue_id, args }),
	deleteIssue: (issue_id: string) => invoke<void>('delete_issue', { issueId: issue_id }),
	moveIssue: (issue_id: string, status: string) =>
		invoke<void>('move_issue', { issueId: issue_id, status }),

	// Fork / revert
	forkSession: (session_id: string, message_id?: string) =>
		invoke<Session>('fork_session', { sessionId: session_id, messageId: message_id ?? null }),
	revertToMessage: (session_id: string, message_id: string) =>
		invoke<void>('revert_to_message', { sessionId: session_id, messageId: message_id }),

	// Routines
	listRoutines: () => invoke<Routine[]>('list_routines'),
	createRoutine: (args: { name: string; message: string; agent_id: string | null; schedule: string }) =>
		invoke<Routine>('create_routine', { args }),
	deleteRoutine: (routine_id: string) => invoke<void>('delete_routine', { routineId: routine_id }),
	runRoutine: (routine_id: string) => invoke<string>('run_routine', { routineId: routine_id }),

	// Trust level
	updateTrustLevel: (session_id: string, trust_level: string) =>
		invoke<void>('update_trust_level', { sessionId: session_id, trustLevel: trust_level }),

	// Search
	searchMessages: (query: string) => invoke<SearchResult[]>('search_messages', { query }),

	// MCP
	listMcpServers: () => invoke<McpServerStatus[]>('list_mcp_servers'),
	addMcpServer: (config: McpServerConfig) => invoke<void>('add_mcp_server', { config }),
	removeMcpServer: (id: string) => invoke<void>('remove_mcp_server', { id }),
	toggleMcpServer: (id: string, enabled: boolean) => invoke<void>('toggle_mcp_server', { id, enabled }),
	testMcpServer: (id: string) => invoke<string[]>('test_mcp_server', { id }),
	startMcpOAuth: (id: string) => invoke<{ authorize_url: string; redirect_uri: string }>('start_mcp_oauth', { id }),

	// Git
	getGitInfo: (path: string) => invoke<{ branch: string | null; dirty: boolean; ahead: number }>('get_git_info', { path }),

	// Claude OAuth
	startClaudeOAuth: () => invoke<void>('start_claude_oauth'),

	// Project
	pickFolder: () => invoke<string | null>('pick_folder'),
};
