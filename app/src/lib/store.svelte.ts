import type { Session, Message, Agent } from './types';

export type PopoverId =
	| 'version' | 'user' | 'settings' | 'agents' | 'workflows'
	| 'issues' | 'files' | 'local' | 'project' | 'branch' | 'add' | 'model';

export const appState = $state({
	sessions: [] as Session[],
	activeSessionId: null as string | null,
	messages: [] as Message[],
	agents: [] as Agent[],
	sidebarOpen: true,
	theme: 'dark' as 'light' | 'dark' | 'oxide',
	streaming: false,
	streamingContent: '',
	streamingThinking: '',
	settingsOpen: false,
	agentsPageOpen: false,
	issuesOpen: false,
	workflowsOpen: false,
	fileInsert: '' as string,
	projectPath: '' as string,
	temperature: 1.0,
	maxTokens: null as number | null,
	streamResponse: true,
	globalSystemPrompt: '',
	activeAgentId: null as string | null,
	popoverId: null as PopoverId | null,
	popoverRect: null as { top: number; bottom: number; left: number; right: number; width: number; height: number } | null,
	popoverAlign: 'left' as 'left' | 'right' | 'center',
	skillsContext: '' as string,
});

export function setTheme(t: 'light' | 'dark' | 'oxide') {
	appState.theme = t;
	document.documentElement.dataset.theme = t;
	localStorage.setItem('hm-theme', t);
}

export function initTheme() {
	const saved = localStorage.getItem('hm-theme') as 'light' | 'dark' | 'oxide' | null;
	setTheme(saved ?? 'dark');
}

// ── Recent projects ───────────────────────────────────────────────────────────

const RECENT_KEY = 'hm-recent-projects';
const RECENT_MAX = 8;

export function getRecentProjects(): string[] {
	try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}

export function pushRecentProject(path: string) {
	if (!path) return;
	const list = getRecentProjects().filter(p => p !== path);
	list.unshift(path);
	localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

export function setProject(path: string) {
	appState.projectPath = path;
	localStorage.setItem('hm-project', path);
	if (path) pushRecentProject(path);
}

export function initSettings() {
	const temp = localStorage.getItem('hm-temperature');
	if (temp !== null) appState.temperature = Number(temp);

	const maxTok = localStorage.getItem('hm-max-tokens');
	appState.maxTokens = maxTok !== null ? Number(maxTok) : null;

	const stream = localStorage.getItem('hm-stream');
	if (stream !== null) appState.streamResponse = stream !== 'false';

	const sysPrompt = localStorage.getItem('hm-global-system-prompt');
	if (sysPrompt !== null) appState.globalSystemPrompt = sysPrompt;
}
