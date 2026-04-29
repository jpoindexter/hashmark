<script lang="ts">
	import { onMount } from 'svelte';
	import { appState, initTheme } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import Sidebar from '$components/Sidebar.svelte';
	import ChatPane from '$components/ChatPane.svelte';
	import Welcome from '$components/Welcome.svelte';
	import Settings from '$components/Settings.svelte';
	import AgentsPage from '$components/AgentsPage.svelte';
	import Issues from '$components/Issues.svelte';
	import WorkflowsPanel from '$components/WorkflowsPanel.svelte';
	import Compose from '$components/Compose.svelte';
	import Popover from '$components/Popover.svelte';
	import { togglePopover, closePopover } from '$lib/popovers.svelte';
	import { setProject, getRecentProjects } from '$lib/store.svelte';
	import type { Session } from '$lib/types';
	import { browser } from '$app/environment';

	async function startAgentSession(agent: import('$lib/types').Agent) {
		closePopover();
		const session = await api.createSession({
			title: 'New session',
			agent_id: agent.id,
			model: agent.model,
			provider: agent.provider,
			project_path: appState.projectPath || undefined,
		});
		appState.sessions = [session, ...appState.sessions];
		appState.activeSessionId = session.id;
		appState.messages = [];
	}

	onMount(async () => {
		initTheme();
		const [sessions, agents] = await Promise.all([
			api.listSessions(),
			api.listAgents(),
		]);
		appState.sessions = sessions;
		appState.agents = agents;

		if (browser) {
			const { listen } = await import('@tauri-apps/api/event');
			listen<string>('open-project', (event) => {
				setProject(event.payload);
			});
		}
	});

	async function selectSession(session: Session) {
		appState.activeSessionId = session.id;
		appState.messages = await api.getMessages(session.id);
	}

	async function newSession() {
		appState.activeSessionId = null;
		appState.messages = [];
		appState.streaming = false;
		appState.streamingContent = '';
	}

	function onKeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;

		if (e.key === 'Escape') {
			if (appState.settingsOpen) { appState.settingsOpen = false; return; }
			if (appState.agentsPageOpen) { appState.agentsPageOpen = false; return; }
			if (appState.issuesOpen) { appState.issuesOpen = false; return; }
			if (appState.workflowsOpen) { appState.workflowsOpen = false; return; }
			return;
		}

		if (!mod) return;

		if (e.key === '\\') {
			e.preventDefault();
			appState.sidebarOpen = !appState.sidebarOpen;
		} else if (e.key === 'n') {
			e.preventDefault();
			newSession();
		} else if (e.key === ',') {
			e.preventDefault();
			appState.settingsOpen = true;
		} else if (e.key === 'w') {
			e.preventDefault();
			appState.activeSessionId = null;
			appState.messages = [];
		} else if (e.key === '[') {
			e.preventDefault();
			const idx = appState.sessions.findIndex(s => s.id === appState.activeSessionId);
			if (idx > 0) selectSession(appState.sessions[idx - 1]);
		} else if (e.key === ']') {
			e.preventDefault();
			const idx = appState.sessions.findIndex(s => s.id === appState.activeSessionId);
			if (idx !== -1 && idx < appState.sessions.length - 1) selectSession(appState.sessions[idx + 1]);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="titlebar" data-tauri-drag-region>
	<div class="tl-spacer"></div>
	<button class="tl-btn" onclick={() => { appState.sidebarOpen = !appState.sidebarOpen; }} title="Toggle sidebar (⌘\)">
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
			<rect x="1" y="1.5" width="5" height="11" rx="1.2" stroke="currentColor" stroke-width="1.1"/>
			<path d="M8 4h5M8 7h5M8 10h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
		</svg>
	</button>
	<div class="tl-search-wrap" data-tauri-drag-region="false">
		<svg class="tl-search-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
			<circle cx="5" cy="5" r="3.3" stroke="currentColor" stroke-width="1.1"/>
			<path d="M7.5 7.5L10.5 10.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
		</svg>
		<input class="tl-search" placeholder="Search sessions, agents, files..." type="search" autocomplete="off" spellcheck="false" />
	</div>
	<button class="tl-btn tl-new-btn" onclick={newSession} title="New session (⌘N)">
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
			<line x1="6" y1="1.5" x2="6" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
			<line x1="1.5" y1="6" x2="10.5" y2="6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
		</svg>
	</button>
</div>

<div class="tab-bar" data-tauri-drag-region>
	<div class="tab-bar-scroll">
		{#each appState.sessions as session (session.id)}
			<button
				class="tab"
				class:active={session.id === appState.activeSessionId}
				onclick={() => selectSession(session)}
				title={session.title}
			>
				<div class="tab-icon">
					<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
						<path d="M1.5 1.5L4 4M4 4L6.5 1.5M4 4V6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
				<span class="tab-title">{session.title}</span>
				{#if appState.streaming && session.id === appState.activeSessionId}
					<span class="tab-dot-running"></span>
				{/if}
			</button>
		{/each}
	</div>
	<button class="tab-new" onclick={newSession} title="New session">
		<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
			<line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
			<line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
		</svg>
	</button>
</div>

<Popover id="version" width={180}>
	<div class="pop-section">Version</div>
	<button class="pop-item pop-item-check">
		<span>v2 (current)</span>
		<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
	</button>
	<button class="pop-item pop-item-muted">v1 (legacy)</button>
</Popover>

<div class="shell">
	<Sidebar onSelectSession={selectSession} onNewSession={newSession} />
	<div class="main-panel">
		{#if appState.activeSessionId === null}
			<Welcome onSelectSession={selectSession} onNewSession={newSession} />
		{:else}
			<ChatPane />
		{/if}
		<Compose />
	</div>
</div>

{#if appState.settingsOpen}
	<Settings />
{/if}

{#if appState.agentsPageOpen}
	<AgentsPage />
{/if}

{#if appState.issuesOpen}
	<Issues />
{/if}

{#if appState.workflowsOpen}
	<WorkflowsPanel />
{/if}

<!-- popSettings -->
<Popover id="settings" width={220}>
	<div class="pop-section">Settings</div>
	<button class="pop-item" onclick={() => { closePopover(); appState.settingsOpen = true; }}>Providers &amp; API keys</button>
	<button class="pop-item" onclick={() => { closePopover(); appState.agentsPageOpen = true; }}>Agents</button>
	<button class="pop-item" onclick={() => { closePopover(); appState.workflowsOpen = true; }}>Workflows</button>
	<div class="pop-divider"></div>
	<div class="pop-section">Theme</div>
	{#each (['light', 'dark', 'oxide'] as const) as t}
		<button class="pop-item" class:pop-item-check={appState.theme === t} onclick={() => { import('$lib/store.svelte').then(m => m.setTheme(t)); closePopover(); }}>
			{t.charAt(0).toUpperCase() + t.slice(1)}
			{#if appState.theme === t}
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
			{/if}
		</button>
	{/each}
</Popover>

<!-- popAgents -->
<Popover id="agents" width={240}>
	<div class="pop-section">Agents</div>
	{#each appState.agents as agent (agent.id)}
		<button class="pop-item" onclick={() => startAgentSession(agent)}>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4" r="2" stroke="currentColor" stroke-width="1.1"/><path d="M1 11c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
			<div class="pop-item-inner">
				<span class="pop-item-name">{agent.name}</span>
				<span class="pop-item-sub">{agent.model}</span>
			</div>
		</button>
	{/each}
	{#if appState.agents.length === 0}
		<div class="pop-empty">No agents yet</div>
	{/if}
	<div class="pop-divider"></div>
	<button class="pop-item" onclick={() => { closePopover(); appState.agentsPageOpen = true; }}>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
		New agent...
	</button>
</Popover>

<!-- popWorkflows -->
<Popover id="workflows" width={260}>
	<div class="pop-section">Workflows</div>
	{#each [
		{ name: 'Plan → Implement → Validate', steps: 3 },
		{ name: 'Bug Hunt', steps: 2 },
		{ name: 'Refactor Sprint', steps: 4 },
	] as wf}
		<button class="pop-item" onclick={() => { closePopover(); appState.workflowsOpen = true; }}>
			<div class="pop-item-inner">
				<span class="pop-item-name">{wf.name}</span>
				<span class="pop-item-sub">{wf.steps} steps</span>
			</div>
			<span class="pop-run-badge">Run</span>
		</button>
	{/each}
	<div class="pop-divider"></div>
	<button class="pop-item" onclick={() => { closePopover(); appState.workflowsOpen = true; }}>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
		New workflow...
	</button>
</Popover>

<!-- popIssues -->
<Popover id="issues" width={280}>
	<div class="pop-section">Issues</div>
	{#each [
		{ title: 'Breadcrumb popover closes on outside click', status: 'open' },
		{ title: 'Streaming stops after 3 tool calls', status: 'open' },
		{ title: 'Sidebar collapse animation flickers on macOS', status: 'closed' },
	] as issue}
		<button class="pop-item" onclick={() => { closePopover(); appState.issuesOpen = true; }}>
			<span class="pop-issue-dot" class:closed={issue.status === 'closed'}></span>
			<span class="pop-item-name">{issue.title}</span>
		</button>
	{/each}
	<div class="pop-divider"></div>
	<button class="pop-item" onclick={() => { closePopover(); appState.issuesOpen = true; }}>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
		New issue...
	</button>
</Popover>

<!-- popFiles -->
<Popover id="files" width={240}>
	<div class="pop-section">Browse files</div>
	<button class="pop-item pop-item-muted">
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 2h3.5l1.5 1.5H10.5a1 1 0 011 1V9.5a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.1"/></svg>
		{appState.projectPath ? appState.projectPath.split('/').pop() : 'No project open'}
	</button>
</Popover>

<!-- popLocal -->
<Popover id="local" width={180}>
	<div class="pop-section">Location</div>
	<button class="pop-item pop-item-check">
		Local
		<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
	</button>
	<button class="pop-item pop-item-muted">Cloud</button>
	<button class="pop-item pop-item-muted">SSH</button>
</Popover>

<!-- popProject -->
<Popover id="project" width={240}>
	<div class="pop-section">Project</div>
	{#if appState.projectPath}
		<button class="pop-item pop-item-check">
			{appState.projectPath.split('/').pop()}
			<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>
	{/if}
	{#each getRecentProjects().filter(p => p !== appState.projectPath).slice(0, 5) as p}
		<button class="pop-item" onclick={() => { setProject(p); closePopover(); }}>
			{p.split('/').pop()}
			<span style="font-size:10px;color:var(--text-muted);margin-left:auto;font-family:monospace;overflow:hidden;text-overflow:ellipsis;max-width:80px">{p.replace(/^\/Users\/[^/]+/, '~')}</span>
		</button>
	{/each}
	{#if !appState.projectPath && getRecentProjects().length === 0}
		<div class="pop-empty">No project open</div>
	{/if}
	<div class="pop-divider"></div>
	<button class="pop-item" onclick={async () => { const p = await api.pickFolder(); if (p) { setProject(p); closePopover(); } }}>
		Open folder…
	</button>
</Popover>

<!-- popBranch -->
<Popover id="branch" width={200}>
	<div class="pop-section">Branch</div>
	<button class="pop-item pop-item-muted">No branch info</button>
</Popover>

<!-- popAdd -->
<Popover id="add" width={220}>
	<div class="pop-section">Add</div>
	<button class="pop-item">Add files</button>
	<button class="pop-item">Add folder</button>
	<button class="pop-item pop-item-muted">Import GitHub issue</button>
	<button class="pop-item pop-item-muted">Slash commands</button>
</Popover>

<style>
:global(.pop-section) {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-muted);
	padding: 6px 12px 3px;
}
:global(.pop-item) {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	padding: 5px 12px;
	font-size: 12px;
	color: var(--text-secondary);
	text-align: left;
	transition: background var(--transition);
	gap: 8px;
}
:global(.pop-item:hover) { background: var(--bg-hover); color: var(--text); }
:global(.pop-item-check) { color: var(--text); }
:global(.pop-item-check svg) { color: var(--accent); flex-shrink: 0; }
:global(.pop-item-muted) { color: var(--text-muted); }
:global(.pop-divider) {
	height: 1px;
	background: var(--border);
	margin: 4px 0;
}
:global(.pop-item-inner) {
	display: flex;
	flex-direction: column;
	gap: 1px;
	flex: 1;
	min-width: 0;
}
:global(.pop-item-name) {
	font-size: 12px;
	color: var(--text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
:global(.pop-item-sub) {
	font-size: 10px;
	color: var(--text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
:global(.pop-empty) {
	padding: 6px 12px;
	font-size: 12px;
	color: var(--text-muted);
}
:global(.pop-run-badge) {
	font-size: 10px;
	font-weight: 600;
	color: var(--accent);
	padding: 1px 6px;
	border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	border-radius: 3px;
	flex-shrink: 0;
}
:global(.pop-issue-dot) {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--accent);
	flex-shrink: 0;
}
:global(.pop-issue-dot.closed) {
	background: var(--text-muted);
}

:global(html, body) {
	height: 100%;
	overflow: hidden;
	background: var(--bg);
}

/* ── Titlebar ── */
.titlebar {
	position: fixed;
	top: 0; left: 0; right: 0;
	height: var(--titlebar-height, 34px);
	z-index: 9999;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 0 8px 0 0;
	background: var(--bg);
	border-bottom: 1px solid var(--border);
	-webkit-app-region: drag;
}
.tl-spacer { width: 72px; flex-shrink: 0; }
.tl-btn {
	width: 28px; height: 28px;
	display: flex; align-items: center; justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-tertiary);
	transition: background 80ms, color 80ms;
	-webkit-app-region: no-drag;
	flex-shrink: 0;
}
.tl-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.tl-new-btn { margin-left: 4px; }

.tl-search-wrap {
	flex: 1;
	position: relative;
	display: flex;
	align-items: center;
	max-width: 480px;
	margin: 0 8px;
	-webkit-app-region: no-drag;
}
.tl-search-icon {
	position: absolute;
	left: 9px;
	color: var(--text-tertiary);
	pointer-events: none;
}
.tl-search {
	width: 100%;
	height: 24px;
	padding: 0 10px 0 28px;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-full);
	font-size: 12px;
	color: var(--text);
	outline: none;
	font-family: var(--font-ui);
	transition: border-color 80ms, background 80ms;
}
.tl-search::placeholder { color: var(--text-tertiary); }
.tl-search:focus { border-color: var(--border-active); background: var(--bg-hover); }
.tl-search::-webkit-search-cancel-button { display: none; }

/* ── Tab bar ── */
.tab-bar {
	position: fixed;
	top: var(--titlebar-height, 34px);
	left: 0; right: 0;
	height: var(--tab-bar-height, 34px);
	z-index: 9998;
	display: flex;
	align-items: stretch;
	background: var(--bg);
	border-bottom: 1px solid var(--border);
	-webkit-app-region: drag;
}
.tab-bar-scroll {
	flex: 1;
	display: flex;
	align-items: stretch;
	overflow-x: auto;
	scrollbar-width: none;
	-webkit-app-region: no-drag;
}
.tab-bar-scroll::-webkit-scrollbar { display: none; }

.tab {
	display: flex;
	align-items: center;
	gap: 6px;
	height: 100%;
	padding: 0 12px;
	font-size: 12px;
	color: var(--text-tertiary);
	white-space: nowrap;
	border-right: 1px solid var(--border);
	transition: background 80ms, color 80ms;
	flex-shrink: 0;
	max-width: 180px;
	-webkit-app-region: no-drag;
	cursor: pointer;
}
.tab:hover { background: var(--bg-elevated); color: var(--text-secondary); }
.tab.active {
	background: var(--bg-panel);
	color: var(--text);
	border-bottom: 2px solid var(--accent);
}
.tab-icon {
	width: 16px; height: 16px;
	border-radius: var(--radius-xs);
	background: color-mix(in srgb, var(--accent) 20%, transparent);
	color: var(--accent);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.tab.active .tab-icon { background: color-mix(in srgb, var(--accent) 30%, transparent); }
.tab-title {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
}
.tab-dot-running {
	width: 5px; height: 5px;
	border-radius: 50%;
	background: var(--accent);
	flex-shrink: 0;
}
.tab-new {
	width: 34px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--text-tertiary);
	border-left: 1px solid var(--border);
	flex-shrink: 0;
	transition: background 80ms, color 80ms;
	-webkit-app-region: no-drag;
}
.tab-new:hover { background: var(--bg-elevated); color: var(--text-secondary); }

/* ── Shell ── */
.shell {
	display: flex;
	height: 100vh;
	width: 100vw;
	overflow: hidden;
	padding-top: calc(var(--titlebar-height, 34px) + var(--tab-bar-height, 34px));
}
.main-panel {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}
</style>
