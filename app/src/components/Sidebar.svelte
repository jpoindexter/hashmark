<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { appState, setTheme } from '$lib/store.svelte';
	import { togglePopover as globalTogglePopover, closePopover as globalClosePopover } from '$lib/popovers.svelte';
	import { api } from '$lib/api';
	import type { Session } from '$lib/types';

	let { onSelectSession, onNewSession } = $props<{
		onSelectSession: (s: Session) => void;
		onNewSession: () => void;
	}>();

	let collapsedGroups = $state<Set<string>>(new Set());
	let ctxMenu = $state<{ visible: boolean; x: number; y: number; sessionId: string } | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let searchQuery = $state('');

	onMount(() => {
		if (!browser) return;
		try {
			const raw = localStorage.getItem('hm-collapsed-groups');
			if (raw) collapsedGroups = new Set(JSON.parse(raw) as string[]);
		} catch {}
	});

	function basename(path: string): string {
		return path.split('/').filter(Boolean).pop() ?? path;
	}

	function getProjectLabel(session: Session): string {
		if (!session.project_path) return 'Other';
		return basename(session.project_path);
	}

	const groupedSessions = $derived(() => {
		const pinned: Session[] = [];
		const map = new Map<string, Session[]>();
		for (const s of appState.sessions) {
			if (s.pinned) { pinned.push(s); continue; }
			const label = getProjectLabel(s);
			if (!map.has(label)) map.set(label, []);
			map.get(label)!.push(s);
		}
		const entries = [...map.entries()].sort(([a], [b]) => {
			if (a === 'Other') return 1;
			if (b === 'Other') return -1;
			const aLatest = map.get(a)!.reduce((m, s) => Math.max(m, s.updated_at), 0);
			const bLatest = map.get(b)!.reduce((m, s) => Math.max(m, s.updated_at), 0);
			return bLatest - aLatest;
		});
		const groups = entries.map(([label, sessions]) => ({ label, sessions }));
		if (pinned.length > 0) groups.unshift({ label: 'Pinned', sessions: pinned });
		return groups;
	});

	const filteredSessions = $derived(
		searchQuery.trim()
			? appState.sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase().trim()))
			: null
	);

	function toggleGroup(label: string) {
		const next = new Set(collapsedGroups);
		if (next.has(label)) next.delete(label);
		else next.add(label);
		collapsedGroups = next;
		try { localStorage.setItem('hm-collapsed-groups', JSON.stringify([...next])); } catch {}
	}

	function closePopovers() { globalClosePopover(); }
	function closeCtxMenu() { ctxMenu = null; }

	async function newSession() {
		closePopovers();
		onNewSession();
	}

	function onSessionContextMenu(e: MouseEvent, session: Session) {
		e.preventDefault();
		closePopovers();
		ctxMenu = { visible: true, x: e.clientX, y: e.clientY, sessionId: session.id };
	}

	function startRename(sessionId: string) {
		const session = appState.sessions.find(s => s.id === sessionId);
		if (!session) return;
		renamingId = sessionId;
		renameValue = session.title;
		closeCtxMenu();
	}

	async function commitRename() {
		if (!renamingId) return;
		const id = renamingId;
		const title = renameValue.trim();
		renamingId = null;
		if (!title) return;
		try {
			await api.renameSession(id, title);
			const idx = appState.sessions.findIndex(s => s.id === id);
			if (idx !== -1) appState.sessions[idx] = { ...appState.sessions[idx], title };
		} catch {}
	}

	function cancelRename() { renamingId = null; }

	function onRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
		else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
	}

	async function deleteSession(sessionId: string) {
		closeCtxMenu();
		if (!confirm('Delete this session?')) return;
		try {
			await api.deleteSession(sessionId);
			appState.sessions = appState.sessions.filter(s => s.id !== sessionId);
			if (appState.activeSessionId === sessionId) onNewSession();
		} catch {}
	}
</script>

{#if ctxMenu?.visible}
	<button class="popover-backdrop" aria-label="Close menu" onclick={closeCtxMenu}></button>
	<div class="ctx-menu" style="left:{ctxMenu.x}px;top:{ctxMenu.y}px;">
		<button class="ctx-item" onclick={() => startRename(ctxMenu!.sessionId)}>Rename</button>
		<button class="ctx-item ctx-item-danger" onclick={() => deleteSession(ctxMenu!.sessionId)}>Delete</button>
	</div>
{/if}

<aside class="sidebar" class:collapsed={!appState.sidebarOpen}>
	<!-- Header: search + new -->
	<div class="sb-header">
		<div class="sb-search-wrap">
			<svg class="sb-search-icon" width="11" height="11" viewBox="0 0 11 11" fill="none">
				<circle cx="4.5" cy="4.5" r="3" stroke="currentColor" stroke-width="1.1"/>
				<line x1="6.8" y1="6.8" x2="9.5" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
			</svg>
			<input
				class="sb-search"
				bind:value={searchQuery}
				placeholder="Search tabs..."
				type="search"
				autocomplete="off"
				spellcheck="false"
			/>
		</div>
		<button class="sb-new-btn" onclick={newSession} title="New session">
			<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
				<line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				<line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
			</svg>
		</button>
	</div>

	<!-- Session list -->
	<div class="sb-sessions" role="listbox" aria-label="Sessions">
		{#if filteredSessions}
			<!-- Search results: flat list -->
			{#each filteredSessions as session (session.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="sb-session"
					class:active={appState.activeSessionId === session.id}
					onclick={() => onSelectSession(session)}
					oncontextmenu={(e) => onSessionContextMenu(e, session)}
					role="option"
					aria-selected={appState.activeSessionId === session.id}
					tabindex="-1"
				>
					{#if renamingId === session.id}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="sb-rename-input"
							bind:value={renameValue}
							onkeydown={onRenameKeydown}
							onblur={commitRename}
							onclick={(e) => e.stopPropagation()}
							autofocus
						/>
					{:else}
						<span class="sb-session-dot" class:running={appState.streaming && session.id === appState.activeSessionId}></span>
						<span class="sb-session-title">{session.title}</span>
						{#if session.project_path}
							<span class="sb-session-project">{basename(session.project_path)}</span>
						{/if}
					{/if}
				</div>
			{/each}
			{#if filteredSessions.length === 0}
				<div class="sb-empty">No matches</div>
			{/if}
		{:else}
			<!-- Normal: grouped by project -->
			{#each groupedSessions() as group (group.label)}
				<button class="sb-group-header" onclick={() => toggleGroup(group.label)}>
					<svg
						class="sb-group-chevron"
						class:collapsed={collapsedGroups.has(group.label)}
						width="10" height="10" viewBox="0 0 10 10" fill="none"
					>
						<path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<span class="sb-group-label">{group.label}</span>
					<span class="sb-group-badge">{group.sessions.length}</span>
				</button>

				{#if !collapsedGroups.has(group.label)}
					{#each group.sessions as session (session.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div
							class="sb-session"
							class:active={appState.activeSessionId === session.id}
							onclick={() => onSelectSession(session)}
							oncontextmenu={(e) => onSessionContextMenu(e, session)}
							role="option"
							aria-selected={appState.activeSessionId === session.id}
							tabindex="-1"
						>
							{#if renamingId === session.id}
								<!-- svelte-ignore a11y_autofocus -->
								<input
									class="sb-rename-input"
									bind:value={renameValue}
									onkeydown={onRenameKeydown}
									onblur={commitRename}
									onclick={(e) => e.stopPropagation()}
									autofocus
								/>
							{:else}
								<span class="sb-session-dot" class:running={appState.streaming && session.id === appState.activeSessionId}></span>
								<span class="sb-session-title">{session.title}</span>
							{/if}
						</div>
					{/each}
				{/if}
			{/each}

			{#if appState.sessions.length === 0}
				<div class="sb-empty">No sessions yet</div>
			{/if}
		{/if}
	</div>

	<!-- Footer -->
	<div class="sb-footer">
		<button class="sb-icon-btn" onclick={(e) => { e.stopPropagation(); globalTogglePopover('agents', e.currentTarget as HTMLElement); }} title="Agents">
			<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
				<circle cx="6.5" cy="4.5" r="2.2" stroke="currentColor" stroke-width="1.1"/>
				<path d="M1.5 12c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
			</svg>
		</button>
		<button class="sb-icon-btn" onclick={(e) => { e.stopPropagation(); globalTogglePopover('settings', e.currentTarget as HTMLElement, 'right'); }} title="Settings">
			<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
				<circle cx="6.5" cy="6.5" r="2" stroke="currentColor" stroke-width="1.1"/>
				<path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.6 2.6l1.1 1.1M9.3 9.3l1.1 1.1M2.6 10.4l1.1-1.1M9.3 3.7l1.1-1.1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
			</svg>
		</button>
		<button class="sb-icon-btn" onclick={() => {
			const cycle = { light: 'dark', dark: 'oxide', oxide: 'light' } as const;
			setTheme(cycle[appState.theme]);
		}} title="Toggle theme">
			<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
				<circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" stroke-width="1.1"/>
				<line x1="6.5" y1="1" x2="6.5" y2="2.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
				<line x1="6.5" y1="10.5" x2="6.5" y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
				<line x1="1" y1="6.5" x2="2.5" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
				<line x1="10.5" y1="6.5" x2="12" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
				<line x1="2.9" y1="2.9" x2="3.96" y2="3.96" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
				<line x1="9.04" y1="9.04" x2="10.1" y2="10.1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
				<line x1="2.9" y1="10.1" x2="3.96" y2="9.04" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
				<line x1="9.04" y1="3.96" x2="10.1" y2="2.9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
			</svg>
		</button>
	</div>
</aside>

<style>
.sidebar {
	width: 200px;
	min-width: 200px;
	background: var(--sidebar-bg);
	border-right: 1px solid var(--border);
	display: flex;
	flex-direction: column;
	position: relative;
	transition: width 200ms cubic-bezier(0.165,0.84,0.44,1), opacity 150ms;
	overflow: hidden;
	flex-shrink: 0;
}
.sidebar.collapsed {
	width: 0;
	min-width: 0;
	opacity: 0;
	pointer-events: none;
}

/* Header */
.sb-header {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 8px 8px 6px;
	flex-shrink: 0;
}
.sb-search-wrap {
	flex: 1;
	position: relative;
	display: flex;
	align-items: center;
}
.sb-search-icon {
	position: absolute;
	left: 7px;
	color: var(--text-tertiary);
	pointer-events: none;
	flex-shrink: 0;
}
.sb-search {
	width: 100%;
	height: 26px;
	padding: 0 8px 0 24px;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-size: 12px;
	color: var(--text);
	outline: none;
	font-family: var(--font-ui);
	transition: border-color 80ms;
}
.sb-search::placeholder { color: var(--text-tertiary); }
.sb-search:focus { border-color: var(--border-active); }
.sb-search::-webkit-search-cancel-button { display: none; }
.sb-new-btn {
	width: 26px;
	height: 26px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-tertiary);
	flex-shrink: 0;
	transition: background 80ms, color 80ms;
}
.sb-new-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

/* Sessions */
.sb-sessions {
	flex: 1;
	overflow-y: auto;
	padding: 2px 0;
	scrollbar-width: thin;
	outline: none;
}
.sb-session {
	display: flex;
	align-items: center;
	width: 100%;
	height: 30px;
	padding: 0 10px 0 12px;
	gap: 8px;
	font-size: 12px;
	color: var(--text-secondary);
	transition: background 80ms;
	position: relative;
	text-align: left;
	box-sizing: border-box;
	flex-shrink: 0;
	cursor: pointer;
}
.sb-session:hover { background: var(--bg-hover); color: var(--text); }
.sb-session.active {
	background: var(--bg-active);
	color: var(--text);
	border-radius: var(--radius-sm);
	outline: 1px solid var(--border-active);
	outline-offset: -1px;
}
.sb-session-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	flex-shrink: 0;
	border: 1.5px solid var(--text-tertiary);
	background: transparent;
}
.sb-session-dot.running {
	background: var(--accent);
	border-color: var(--accent);
}
.sb-session-title {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.sb-session-project {
	font-size: 10px;
	color: var(--text-tertiary);
	flex-shrink: 0;
	max-width: 72px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.sb-rename-input {
	flex: 1;
	font-size: 12px;
	color: var(--text);
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	padding: 1px 5px;
	outline: none;
	min-width: 0;
}
.sb-rename-input:focus { border-color: var(--accent); }
.sb-empty {
	padding: 16px 14px;
	font-size: 12px;
	color: var(--text-tertiary);
}
.sb-group-header {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 100%;
	padding: 6px 12px 2px;
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-tertiary);
	text-align: left;
	margin-top: 2px;
	transition: color 80ms;
}
.sb-group-header:hover { color: var(--text-secondary); }
.sb-group-chevron {
	color: var(--text-tertiary);
	flex-shrink: 0;
	transition: transform 120ms ease;
}
.sb-group-chevron.collapsed { transform: rotate(-90deg); }
.sb-group-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-group-badge {
	flex-shrink: 0;
	font-size: 10px;
	font-weight: 500;
	color: var(--text-tertiary);
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: 10px;
	padding: 0 5px;
	line-height: 16px;
	min-width: 16px;
	text-align: center;
}

/* Footer */
.sb-footer {
	border-top: 1px solid var(--border);
	padding: 4px 2px;
	display: flex;
	align-items: center;
	gap: 2px;
	flex-shrink: 0;
}
.sb-icon-btn {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-tertiary);
	transition: background 80ms, color 80ms;
	flex-shrink: 0;
}
.sb-icon-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

.popover-backdrop {
	position: fixed;
	inset: 0;
	z-index: 99;
}
.ctx-menu {
	position: fixed;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	box-shadow: var(--shadow-lg);
	z-index: 200;
	padding: 4px 0;
	min-width: 130px;
}
.ctx-item {
	display: block;
	width: 100%;
	padding: 5px 12px;
	font-size: 12px;
	color: var(--text-secondary);
	text-align: left;
	transition: background 80ms, color 80ms;
}
.ctx-item:hover { background: var(--bg-hover); color: var(--text); }
.ctx-item-danger { color: var(--red); }
.ctx-item-danger:hover { background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red); }
</style>
