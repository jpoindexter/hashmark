<script lang="ts">
	import { appState } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import type { Agent } from '$lib/types';

	let fileInput = $state<HTMLInputElement | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);
	let agentSearch = $state('');

	type AgentStat = { sessions: number; messages: number; lastUsed: number | null };
	let agentStats = $state<Record<string, AgentStat>>(
		(() => { try { return JSON.parse(localStorage.getItem('hm-agent-stats') ?? '{}') as Record<string, AgentStat>; } catch { return {}; } })()
	);

	function saveAgentStats() {
		try { localStorage.setItem('hm-agent-stats', JSON.stringify(agentStats)); } catch {}
	}

	function relativeDate(ts: number | null): string {
		if (!ts) return 'Never';
		const diff = Date.now() - ts;
		const days = Math.floor(diff / 86400000);
		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days < 30) return `${days} days ago`;
		const months = Math.floor(days / 30);
		return months === 1 ? '1 month ago' : `${months} months ago`;
	}

	$effect(() => {
		function onAgentMessage(e: Event) {
			const { agentId, sessionId } = (e as CustomEvent<{ agentId: string; sessionId: string }>).detail;
			const prev = agentStats[agentId] ?? { sessions: 0, messages: 0, lastUsed: null };
			const sessionIds: string[] = (() => { try { return JSON.parse(localStorage.getItem(`hm-agent-sessions-${agentId}`) ?? '[]') as string[]; } catch { return []; } })();
			const isNewSession = !sessionIds.includes(sessionId);
			if (isNewSession) sessionIds.push(sessionId);
			try { localStorage.setItem(`hm-agent-sessions-${agentId}`, JSON.stringify(sessionIds)); } catch {}
			agentStats = {
				...agentStats,
				[agentId]: {
					sessions: isNewSession ? prev.sessions + 1 : prev.sessions,
					messages: prev.messages + 1,
					lastUsed: Date.now(),
				},
			};
			saveAgentStats();
		}
		window.addEventListener('agent-message-sent', onAgentMessage);
		return () => window.removeEventListener('agent-message-sent', onAgentMessage);
	});

	// Tag state
	let agentTags = $state<Record<string, string[]>>({});
	let activeTagFilter = $state<string | null>(null);
	let formTags = $state<string[]>([]);
	let tagInputValue = $state('');
	let tagInputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		try {
			const raw = localStorage.getItem('hm-agent-tags');
			if (raw) agentTags = JSON.parse(raw) as Record<string, string[]>;
		} catch {}
	});

	function saveTags() {
		try { localStorage.setItem('hm-agent-tags', JSON.stringify(agentTags)); } catch {}
	}

	function addFormTag(raw: string) {
		const tag = raw.trim().replace(/,/g, '');
		if (!tag || formTags.includes(tag)) return;
		formTags = [...formTags, tag];
	}

	function removeFormTag(tag: string) {
		formTags = formTags.filter(t => t !== tag);
	}

	function onTagKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addFormTag(tagInputValue);
			tagInputValue = '';
		} else if (e.key === 'Backspace' && tagInputValue === '' && formTags.length > 0) {
			formTags = formTags.slice(0, -1);
		}
	}

	function onTagInput() {
		if (tagInputValue.includes(',')) {
			const parts = tagInputValue.split(',');
			const last = parts.pop() ?? '';
			parts.forEach(p => addFormTag(p));
			tagInputValue = last;
		}
	}

	function modelBadge(model: string): string | null {
		const m = model.toLowerCase();
		if (m.includes('opus')) return 'Opus';
		if (m.includes('sonnet')) return 'Sonnet';
		if (m.includes('haiku')) return 'Haiku';
		return null;
	}

	const allTags = $derived(() => {
		const set = new Set<string>();
		Object.values(agentTags).forEach(tags => tags.forEach(t => set.add(t)));
		return [...set].sort();
	});

	function agentExportPayload(agent: Agent) {
		return {
			name: agent.name,
			system: agent.system,
			model: agent.model,
			provider: agent.provider,
			max_tokens: agent.max_tokens,
			tags: agentTags[agent.id] ?? [],
			version: 1,
		};
	}

	function downloadJson(filename: string, data: unknown) {
		const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportAgent(agent: Agent, e: MouseEvent) {
		e.stopPropagation();
		downloadJson(`hashmark-agent-${agent.name}.json`, agentExportPayload(agent));
	}

	function exportAll() {
		downloadJson('hashmark-agents.json', appState.agents.map(agentExportPayload));
	}

	function copyAgentConfig(agent: Agent, e: MouseEvent) {
		e.stopPropagation();
		navigator.clipboard.writeText(JSON.stringify(agentExportPayload(agent), null, 2));
	}

	type ImportItem = { name: string; system: string; model: string; provider: string; max_tokens?: number; tags?: string[] };

	function isValidImportItem(x: unknown): x is ImportItem {
		if (!x || typeof x !== 'object') return false;
		const o = x as Record<string, unknown>;
		return typeof o.name === 'string' && typeof o.system === 'string' &&
			typeof o.model === 'string' && typeof o.provider === 'string';
	}

	async function onFileSelected(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		let data: unknown;
		try {
			data = JSON.parse(await file.text());
		} catch {
			if (fileInput) fileInput.value = '';
			return;
		}
		const raw = Array.isArray(data) ? data : [data];
		const items = raw.filter(isValidImportItem);
		if (items.length === 0) {
			if (fileInput) fileInput.value = '';
			return;
		}
		const existing = new Set(appState.agents.map(a => a.name));
		let imported = 0;
		for (const item of items) {
			const name = existing.has(item.name) ? `${item.name} (imported)` : item.name;
			const created = await api.createAgent({
				name,
				system: item.system ?? '',
				model: item.model,
				provider: item.provider ?? 'anthropic',
				max_tokens: item.max_tokens ?? 8192,
			});
			if (item.tags && item.tags.length > 0) {
				agentTags = { ...agentTags, [created.id]: item.tags };
				saveTags();
			}
			existing.add(name);
			imported++;
		}
		appState.agents = await api.listAgents();
		if (fileInput) fileInput.value = '';
	}

	const PROVIDERS = [
		'anthropic', 'openai', 'gemini', 'mistral', 'groq',
		'deepseek', 'openrouter', 'ollama', 'grok',
	] as const;

	let selectedId = $state<string | null>(null);
	let isNew = $state(false);
	let saving = $state(false);
	let confirmDeleteId = $state<string | null>(null);

	const PRESETS = [
		{
			name: 'Code Reviewer',
			model: 'claude-sonnet-4-6',
			provider: 'anthropic',
			system: 'You are an expert code reviewer. Analyze code for bugs, security issues, performance problems, and style violations. Be specific and actionable in your feedback. Reference line numbers when relevant.',
		},
		{
			name: 'Bug Hunter',
			model: 'claude-opus-4-6',
			provider: 'anthropic',
			system: 'You are a systematic debugger. When given a bug report or failing code, reproduce the issue mentally, form hypotheses about root causes, and propose targeted fixes. Show your reasoning step by step.',
		},
		{
			name: 'Refactor Assistant',
			model: 'claude-sonnet-4-6',
			provider: 'anthropic',
			system: 'You are a refactoring specialist. Improve code structure, readability, and maintainability without changing behavior. Prefer small, safe transformations. Explain each change and why it improves the code.',
		},
		{
			name: 'Doc Writer',
			model: 'claude-haiku-4-5',
			provider: 'anthropic',
			system: 'You write clear, concise technical documentation. Generate README files, inline comments, API docs, and usage examples. Match the existing documentation style. Be accurate and avoid filler text.',
		},
		{
			name: 'Test Generator',
			model: 'claude-sonnet-4-6',
			provider: 'anthropic',
			system: 'You write comprehensive test suites. Generate unit tests, integration tests, and edge case tests. Use the existing test framework and patterns in the codebase. Aim for high coverage of both happy paths and error conditions.',
		},
		{
			name: 'Security Auditor',
			model: 'claude-opus-4-6',
			provider: 'anthropic',
			system: 'You are a security researcher auditing code for vulnerabilities. Check for OWASP Top 10, injection attacks, auth issues, insecure dependencies, and data exposure. Provide severity ratings and concrete remediation steps.',
		},
	] as const;

	function applyPreset(preset: typeof PRESETS[number]) {
		isNew = true;
		selectedId = null;
		confirmDeleteId = null;
		formName = preset.name;
		formProvider = preset.provider;
		formModel = preset.model;
		formSystem = preset.system;
		formTags = [];
		tagInputValue = '';
	}

	let formName = $state('');
	let formProvider = $state('anthropic');
	let formModel = $state('');
	let formSystem = $state('');
	let formMaxTokens = $state(8192);

	function close() {
		appState.agentsPageOpen = false;
		selectedId = null;
		isNew = false;
		confirmDeleteId = null;
	}

	function selectAgent(agent: Agent) {
		isNew = false;
		selectedId = agent.id;
		confirmDeleteId = null;
		formName = agent.name;
		formProvider = agent.provider;
		formModel = agent.model;
		formSystem = agent.system;
		formMaxTokens = agent.max_tokens ?? 8192;
		formTags = [...(agentTags[agent.id] ?? [])];
		tagInputValue = '';
	}

	function startNew() {
		isNew = true;
		selectedId = null;
		confirmDeleteId = null;
		formName = '';
		formProvider = 'anthropic';
		formModel = '';
		formSystem = '';
		formMaxTokens = 8192;
		formTags = [];
		tagInputValue = '';
	}

	function cancelForm() {
		isNew = false;
		selectedId = null;
		confirmDeleteId = null;
	}

	async function saveAgent() {
		if (!formName.trim() || !formModel.trim()) return;
		saving = true;
		try {
			const args = {
				name: formName.trim(),
				system: formSystem.trim(),
				model: formModel.trim(),
				provider: formProvider,
				max_tokens: formMaxTokens,
			};
			let savedId = selectedId;
			if (isNew) {
				const created = await api.createAgent(args);
				appState.agents = [...appState.agents, created];
				savedId = created.id;
				isNew = false;
				selectedId = created.id;
			} else if (selectedId) {
				await api.updateAgent(selectedId, args);
				appState.agents = appState.agents.map(a =>
					a.id === selectedId ? { ...a, ...args } : a
				);
			}
			if (savedId) {
				agentTags = { ...agentTags, [savedId]: [...formTags] };
				saveTags();
			}
		} finally {
			saving = false;
		}
	}

	async function duplicateAgent(agent: Agent, e: MouseEvent) {
		e.stopPropagation();
		await api.createAgent({
			name: agent.name + ' (copy)',
			system: agent.system,
			model: agent.model,
			provider: agent.provider,
			max_tokens: agent.max_tokens,
		});
		appState.agents = await api.listAgents();
	}

	async function confirmDelete(id: string) {
		if (confirmDeleteId !== id) {
			confirmDeleteId = id;
			return;
		}
		try {
			await api.deleteAgent(id);
			appState.agents = appState.agents.filter(a => a.id !== id);
			const updated = { ...agentTags };
			delete updated[id];
			agentTags = updated;
			saveTags();
			if (selectedId === id) {
				selectedId = null;
				isNew = false;
				confirmDeleteId = null;
			} else {
				confirmDeleteId = null;
			}
		} catch {
			confirmDeleteId = null;
		}
	}

	function onBackdropClick() {
		close();
	}

	function onPanelClick(e: MouseEvent) {
		e.stopPropagation();
	}

	$effect(() => {
		if (selectedId || isNew) confirmDeleteId = null;
	});

	const sessionCountByAgent = $derived(() => {
		const counts: Record<string, number> = {};
		appState.sessions.forEach(s => { if (s.agent_id) counts[s.agent_id] = (counts[s.agent_id] ?? 0) + 1; });
		return counts;
	});

	const maxSessionCount = $derived(Math.max(0, ...Object.values(sessionCountByAgent())));
	const sessionsWithAgent = $derived(appState.sessions.filter(s => s.agent_id).length);
	const mostUsedAgent = $derived(() => {
		if (maxSessionCount === 0) return null;
		const topId = Object.entries(sessionCountByAgent()).find(([, c]) => c === maxSessionCount)?.[0];
		return appState.agents.find(a => a.id === topId)?.name ?? null;
	});

	const formValid = $derived(formName.trim().length > 0 && formModel.trim().length > 0);
	const showForm = $derived(isNew || selectedId !== null);

	const filteredAgents = $derived(
		appState.agents.filter(a => {
			const matchSearch = !agentSearch ||
				a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
				a.system.toLowerCase().includes(agentSearch.toLowerCase());
			const matchTag = !activeTagFilter ||
				(agentTags[a.id] ?? []).includes(activeTagFilter);
			return matchSearch && matchTag;
		})
	);

	$effect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== '/') return;
			const tag = (document.activeElement as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
			e.preventDefault();
			searchInput?.focus();
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

<button class="backdrop" aria-label="Close agents" onclick={onBackdropClick}></button>

<div class="panel" role="dialog" aria-modal="true" tabindex="-1" onclick={onPanelClick} onkeydown={(e) => e.stopPropagation()}>
	<div class="panel-header">
		<span class="panel-title">Agents</span>
		<div class="header-actions">
			<input
				bind:this={fileInput}
				type="file"
				accept=".json"
				style="display:none"
				onchange={onFileSelected}
			/>
			<button class="hdr-btn" title="Import agents from JSON" onclick={() => fileInput?.click()}>
				<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
					<path d="M6.5 1v8M3.5 6l3 3 3-3M1.5 11h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				Import
			</button>
			<button class="hdr-btn" title="Export all agents" onclick={exportAll} disabled={appState.agents.length === 0}>
				<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
					<path d="M6.5 9V1M3.5 4l3-3 3 3M1.5 11h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				Export all
			</button>
			<button class="close-btn" aria-label="Close" onclick={close}>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	</div>

	<div class="body">
		<!-- Left: agent list -->
		<div class="list-col">
			{#if appState.agents.length > 0}
				<div class="stats-strip">
					<span class="stat">{appState.agents.length} agent{appState.agents.length === 1 ? '' : 's'}</span>
					<span class="stat-sep">·</span>
					<span class="stat">{sessionsWithAgent} session{sessionsWithAgent === 1 ? '' : 's'} with agent</span>
					{#if mostUsedAgent()}
						<span class="stat-sep">·</span>
						<span class="stat">Top: <span class="stat-name">{mostUsedAgent()}</span></span>
					{/if}
				</div>
			{/if}
			<div class="search-wrap">
				<div class="search-row">
					<svg class="search-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
						<circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/>
						<path d="M8 8l2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
					</svg>
					<input
						bind:this={searchInput}
						class="search-input"
						type="text"
						placeholder="Search agents…"
						bind:value={agentSearch}
					/>
					{#if agentSearch}
						<button class="search-clear" aria-label="Clear search" onclick={() => { agentSearch = ''; searchInput?.focus(); }}>
							<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
								<path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
							</svg>
						</button>
					{/if}
				</div>
				<div class="search-count">
					{#if agentSearch || activeTagFilter}
						{filteredAgents.length} of {appState.agents.length} agents
					{:else}
						{appState.agents.length} agent{appState.agents.length === 1 ? '' : 's'}
					{/if}
				</div>
			</div>

			{#if allTags().length > 0}
				<div class="tag-filter-bar">
					<button
						class="tag-pill"
						class:tag-pill-active={activeTagFilter === null}
						onclick={() => { activeTagFilter = null; }}
					>All</button>
					{#each allTags() as tag}
						<button
							class="tag-pill"
							class:tag-pill-active={activeTagFilter === tag}
							onclick={() => { activeTagFilter = activeTagFilter === tag ? null : tag; }}
						>{tag}</button>
					{/each}
				</div>
			{/if}

			{#each filteredAgents as agent (agent.id)}
				{@const count = sessionCountByAgent()[agent.id] ?? 0}
				{@const tags = agentTags[agent.id] ?? []}
				{@const badge = modelBadge(agent.model)}
				{@const stat = agentStats[agent.id]}
				<div
					class="agent-row"
					class:active={selectedId === agent.id && !isNew}
					role="button"
					tabindex="0"
					onclick={() => selectAgent(agent)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAgent(agent); } }}
				>
					<div class="agent-row-info">
						<div class="agent-row-name-line">
							<span class="agent-row-name">{agent.name}</span>
							{#if badge}
								<span class="model-badge">{badge}</span>
							{/if}
						</div>
						<span class="agent-row-sub">{agent.provider} · {agent.model}</span>
						<span class="agent-row-stats">
							{#if stat && stat.messages > 0}
								{stat.sessions} session{stat.sessions === 1 ? '' : 's'} · {stat.messages} msg{stat.messages === 1 ? '' : 's'} · {relativeDate(stat.lastUsed)}
							{:else}
								Never used
							{/if}
						</span>
						{#if tags.length > 0}
							<div class="agent-row-tags">
								{#each tags as t}
									<span class="agent-tag-chip">{t}</span>
								{/each}
							</div>
						{/if}
					</div>
					<span class="session-badge" class:muted={count === 0} title="{count} session{count === 1 ? '' : 's'}">
						{#if maxSessionCount > 0 && count === maxSessionCount}<span class="star">★</span>{/if}{count}
					</span>
					<button
						class="export-btn"
						title="Export agent"
						onclick={(e) => exportAgent(agent, e)}
					>
						<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
							<path d="M5.5 7.5V1M3 3.5l2.5-2.5L8 3.5M1 9.5h9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					<button
						class="export-btn"
						title="Copy agent config to clipboard"
						onclick={(e) => copyAgentConfig(agent, e)}
					>
						<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
							<rect x="1" y="3" width="6" height="7" rx="0.8" stroke="currentColor" stroke-width="1.1"/>
							<path d="M3.5 3V2a0.8 0.8 0 0 1 0.8-0.8h4.4a0.8 0.8 0 0 1 0.8 0.8v6.2a0.8 0.8 0 0 1-0.8 0.8H8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
						</svg>
					</button>
					<button
						class="export-btn"
						title="Duplicate agent"
						onclick={(e) => duplicateAgent(agent, e)}
					>
						<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
							<rect x="1" y="3" width="6" height="7" rx="0.8" stroke="currentColor" stroke-width="1.1"/>
							<path d="M3.5 3V2a0.8 0.8 0 0 1 0.8-0.8h4.4a0.8 0.8 0 0 1 0.8 0.8v6.2a0.8 0.8 0 0 1-0.8 0.8H8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
						</svg>
					</button>
					<button
						class="trash-btn"
						class:confirm={confirmDeleteId === agent.id}
						title={confirmDeleteId === agent.id ? 'Click again to confirm' : 'Delete agent'}
						onclick={(e) => { e.stopPropagation(); confirmDelete(agent.id); }}
					>
						{#if confirmDeleteId === agent.id}
							<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
								<path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
							</svg>
						{:else}
							<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
								<path d="M1.5 3h8M4 3V2h3v1M2.5 3l.5 6h5l.5-6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						{/if}
					</button>
				</div>
			{/each}

			{#if filteredAgents.length === 0}
				<div class="list-empty">
					{#if agentSearch || activeTagFilter}
						No agents match current filters
					{:else}
						No agents yet
					{/if}
				</div>
			{/if}

			<div class="list-footer">
				<button class="new-agent-btn" onclick={startNew} class:active={isNew}>
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
						<line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
						<line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
					</svg>
					New agent
				</button>
			</div>
		</div>

		<!-- Right: edit/create form -->
		<div class="form-col">
			{#if showForm}
				<div class="form-body">
					<div class="form-group">
						<label class="form-label" for="agent-name">Name</label>
						<input
							id="agent-name"
							class="form-input"
							type="text"
							placeholder="Agent name"
							bind:value={formName}
						/>
					</div>

					<div class="form-group">
						<label class="form-label" for="agent-provider">Provider</label>
						<select id="agent-provider" class="form-select" bind:value={formProvider}>
							{#each PROVIDERS as p}
								<option value={p}>{p}</option>
							{/each}
						</select>
					</div>

					<div class="form-group">
						<label class="form-label" for="agent-model">Model</label>
						<input
							id="agent-model"
							class="form-input"
							type="text"
							placeholder="e.g. claude-sonnet-4-6"
							bind:value={formModel}
						/>
					</div>

					<div class="form-group">
						<label class="form-label" for="agent-max-tokens">Max tokens</label>
						<input
							id="agent-max-tokens"
							class="form-input"
							type="number"
							min="256"
							max="32768"
							step="256"
							bind:value={formMaxTokens}
						/>
					</div>

					<div class="form-group">
						<label class="form-label" for="agent-tags">Tags</label>
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div class="tag-input-wrap" role="group" onclick={() => tagInputEl?.focus()} onkeydown={() => {}}>
							{#each formTags as t}
								<span class="form-tag-chip">
									{t}
									<button class="form-tag-remove" aria-label="Remove tag {t}" onclick={() => removeFormTag(t)}>
										<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
											<path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
										</svg>
									</button>
								</span>
							{/each}
							<input
								id="agent-tags"
								bind:this={tagInputEl}
								class="tag-text-input"
								type="text"
								placeholder={formTags.length === 0 ? 'Add tags…' : ''}
								bind:value={tagInputValue}
								onkeydown={onTagKeyDown}
								oninput={onTagInput}
							/>
						</div>
						<span class="form-hint">Press Enter or comma to add</span>
					</div>

					<div class="form-group form-group-grow">
						<label class="form-label" for="agent-system">System prompt</label>
						<textarea
							id="agent-system"
							class="form-textarea"
							placeholder="You are a helpful assistant…"
							bind:value={formSystem}
						></textarea>
					</div>

					<div class="form-actions">
						<button class="btn-cancel" onclick={cancelForm}>Cancel</button>
						<button
							class="btn-save"
							disabled={!formValid || saving}
							onclick={saveAgent}
						>
							{#if saving}
								Saving…
							{:else if isNew}
								Create
							{:else}
								Save
							{/if}
						</button>
					</div>
				</div>
			{:else}
				<div class="presets-panel">
					<div class="presets-heading">Presets</div>
					<div class="presets-grid">
						{#each PRESETS as preset}
							<button class="preset-card" onclick={() => applyPreset(preset)}>
								<div class="preset-card-name">{preset.name}</div>
								<div class="preset-card-preview">
									{preset.system.length > 80 ? preset.system.slice(0, 80) + '…' : preset.system}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
.backdrop {
	position: fixed;
	inset: 0;
	z-index: 200;
	background: rgba(0,0,0,0.3);
}

.panel {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 201;
	width: 700px;
	max-height: 80vh;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-overlay);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	animation: fade-in 120ms ease;
}

@keyframes fade-in {
	from { opacity: 0; transform: translate(-50%, -48%); }
	to { opacity: 1; transform: translate(-50%, -50%); }
}

.panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px 12px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}
.header-actions {
	display: flex;
	align-items: center;
	gap: 4px;
}

.hdr-btn {
	display: flex;
	align-items: center;
	gap: 5px;
	padding: 4px 8px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--stroke-secondary);
	font-size: 11px;
	color: var(--text-tertiary);
	transition: background var(--transition), color var(--transition), border-color var(--transition);
}
.hdr-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-secondary); border-color: var(--stroke-primary); }
.hdr-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.panel-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--text);
}
.close-btn {
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-tertiary);
	transition: background var(--transition), color var(--transition);
}
.close-btn:hover { background: var(--bg-hover); color: var(--text); }

.body {
	display: flex;
	flex: 1;
	overflow: hidden;
}

.list-col {
	width: 240px;
	min-width: 240px;
	border-right: 1px solid var(--border);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.search-wrap {
	padding: 8px 8px 6px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.search-row {
	display: flex;
	align-items: center;
	gap: 6px;
	background: var(--bg-elevated);
	border: 1px solid var(--stroke-secondary);
	border-radius: var(--radius-sm);
	padding: 4px 7px;
	transition: border-color var(--transition);
}
.search-row:focus-within {
	border-color: var(--stroke-primary);
}

.search-icon {
	color: var(--text-muted);
	flex-shrink: 0;
}

.search-input {
	flex: 1;
	background: transparent;
	border: none;
	outline: none;
	font-size: 12px;
	color: var(--text);
	font-family: inherit;
}
.search-input::placeholder {
	color: var(--text-muted);
}

.search-clear {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border-radius: 2px;
	color: var(--text-muted);
	flex-shrink: 0;
	transition: background var(--transition), color var(--transition);
}
.search-clear:hover {
	background: var(--bg-hover);
	color: var(--text);
}

.search-count {
	font-size: 10px;
	color: var(--text-muted);
	padding: 0 2px;
}

.tag-filter-bar {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	padding: 6px 8px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}

.tag-pill {
	display: inline-flex;
	align-items: center;
	padding: 2px 7px;
	border-radius: 9px;
	border: 1px solid var(--stroke-secondary);
	font-size: 10px;
	color: var(--text-muted);
	background: transparent;
	cursor: pointer;
	transition: background var(--transition), color var(--transition), border-color var(--transition);
	white-space: nowrap;
}
.tag-pill:hover { background: var(--bg-hover); color: var(--text-secondary); border-color: var(--stroke-primary); }
.tag-pill-active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }

.agent-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	padding: 7px 10px 7px 12px;
	gap: 6px;
	text-align: left;
	transition: background var(--transition);
	position: relative;
	flex-shrink: 0;
	cursor: pointer;
	user-select: none;
}
.agent-row:hover { background: var(--bg-hover); }
.agent-row.active { background: var(--bg-active); }
.agent-row.active::before {
	content: '';
	position: absolute;
	left: 0; top: 4px; bottom: 4px;
	width: 2px;
	background: var(--accent);
	border-radius: 0 1px 1px 0;
}

.agent-row-info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.agent-row-name-line {
	display: flex;
	align-items: center;
	gap: 5px;
	min-width: 0;
}

.agent-row-name {
	font-size: 12px;
	color: var(--text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.model-badge {
	display: inline-flex;
	align-items: center;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	background: var(--accent-dim);
	color: var(--accent);
	flex-shrink: 0;
	white-space: nowrap;
}

.agent-row-sub {
	font-size: 10px;
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.agent-row-stats {
	font-size: 10px;
	color: var(--text-muted);
	opacity: 0.7;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	margin-top: 1px;
}

.agent-row-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 3px;
	margin-top: 1px;
}

.agent-tag-chip {
	display: inline-flex;
	align-items: center;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 9px;
	background: var(--bg-elevated);
	color: var(--text-muted);
	border: 1px solid var(--stroke-secondary);
	white-space: nowrap;
}

.trash-btn {
	width: 22px;
	height: 22px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-muted);
	flex-shrink: 0;
	opacity: 0;
	transition: opacity var(--transition), background var(--transition), color var(--transition);
}
.export-btn {
	width: 22px;
	height: 22px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-muted);
	flex-shrink: 0;
	opacity: 0;
	transition: opacity var(--transition), background var(--transition), color var(--transition);
}
.agent-row:hover .export-btn { opacity: 1; }
.export-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

.agent-row:hover .trash-btn { opacity: 1; }
.trash-btn:hover { background: color-mix(in srgb, var(--red) 12%, transparent); color: var(--red); }
.trash-btn.confirm { opacity: 1; color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }

.list-empty {
	padding: 14px 12px;
	font-size: 12px;
	color: var(--text-muted);
}

.list-footer {
	margin-top: auto;
	border-top: 1px solid var(--border);
	padding: 8px;
	flex-shrink: 0;
}
.new-agent-btn {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	padding: 5px 8px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--stroke-secondary);
	font-size: 12px;
	color: var(--text-tertiary);
	text-align: left;
	transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.new-agent-btn:hover { background: var(--bg-hover); border-color: var(--stroke-primary); color: var(--text-secondary); }
.new-agent-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.form-col {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.presets-panel {
	flex: 1;
	display: flex;
	flex-direction: column;
	padding: 14px 16px;
	gap: 10px;
	overflow-y: auto;
	scrollbar-width: thin;
}

.presets-heading {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--text-muted);
}

.presets-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.preset-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 11px;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: border-color var(--transition), background var(--transition);
}
.preset-card:hover {
	border-color: var(--accent);
	background: var(--bg-hover);
}

.preset-card-name {
	font-size: 12px;
	font-weight: 600;
	color: var(--text);
}

.preset-card-preview {
	font-size: 11px;
	color: var(--text-muted);
	line-height: 1.45;
}

.form-body {
	flex: 1;
	display: flex;
	flex-direction: column;
	padding: 14px 16px;
	gap: 12px;
	overflow-y: auto;
	scrollbar-width: thin;
}

.form-group {
	display: flex;
	flex-direction: column;
	gap: 5px;
}
.form-group-grow {
	flex: 1;
	min-height: 0;
}

.form-label {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-muted);
}

.form-input,
.form-select {
	background: var(--bg-elevated);
	border: 1px solid var(--stroke-secondary);
	border-radius: var(--radius-sm);
	padding: 6px 9px;
	font-size: 12px;
	color: var(--text);
	outline: none;
	transition: border-color var(--transition);
	width: 100%;
}
.form-input:focus,
.form-select:focus { border-color: var(--stroke-primary); }
.form-input::placeholder { color: var(--text-muted); }

.form-select {
	appearance: none;
	cursor: pointer;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 9px center;
	padding-right: 28px;
}

.form-textarea {
	flex: 1;
	background: var(--bg-elevated);
	border: 1px solid var(--stroke-secondary);
	border-radius: var(--radius-sm);
	padding: 7px 9px;
	font-size: 12px;
	color: var(--text);
	outline: none;
	resize: none;
	font-family: inherit;
	line-height: 1.5;
	min-height: 120px;
	transition: border-color var(--transition);
	width: 100%;
}
.form-textarea:focus { border-color: var(--stroke-primary); }
.form-textarea::placeholder { color: var(--text-muted); }

.tag-input-wrap {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	align-items: center;
	background: var(--bg-elevated);
	border: 1px solid var(--stroke-secondary);
	border-radius: var(--radius-sm);
	padding: 5px 8px;
	cursor: text;
	min-height: 32px;
	transition: border-color var(--transition);
}
.tag-input-wrap:focus-within { border-color: var(--stroke-primary); }

.form-tag-chip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px;
	border-radius: 3px;
	font-size: 11px;
	background: var(--accent-dim);
	color: var(--accent);
	border: 1px solid var(--accent);
	white-space: nowrap;
}

.form-tag-remove {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 12px;
	height: 12px;
	border-radius: 2px;
	color: var(--accent);
	opacity: 0.7;
	transition: opacity var(--transition);
}
.form-tag-remove:hover { opacity: 1; }

.tag-text-input {
	flex: 1;
	min-width: 80px;
	background: transparent;
	border: none;
	outline: none;
	font-size: 12px;
	color: var(--text);
	font-family: inherit;
	padding: 0;
}
.tag-text-input::placeholder { color: var(--text-muted); }

.form-hint {
	font-size: 10px;
	color: var(--text-muted);
	opacity: 0.7;
}

.form-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	flex-shrink: 0;
	padding-top: 2px;
}

.btn-cancel {
	padding: 6px 14px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--stroke-secondary);
	font-size: 12px;
	color: var(--text-tertiary);
	transition: background var(--transition), color var(--transition);
}
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-secondary); }

.btn-save {
	padding: 6px 16px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--accent);
	background: var(--accent);
	font-size: 12px;
	color: #fff;
	transition: opacity var(--transition);
}
.btn-save:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-save:not(:disabled):hover { opacity: 0.88; }

.stats-strip {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px;
	padding: 6px 12px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}
.stat {
	font-size: 10px;
	color: var(--text-muted);
	white-space: nowrap;
}
.stat-sep {
	font-size: 10px;
	color: var(--text-muted);
	opacity: 0.4;
}
.stat-name {
	color: var(--text-secondary);
}

.session-badge {
	font-size: 10px;
	color: var(--accent);
	background: var(--accent-dim);
	border-radius: var(--radius-sm);
	padding: 1px 5px;
	flex-shrink: 0;
	white-space: nowrap;
	display: flex;
	align-items: center;
	gap: 2px;
	opacity: 0;
	transition: opacity var(--transition);
}
.agent-row:hover .session-badge,
.agent-row.active .session-badge { opacity: 1; }
.session-badge.muted {
	color: var(--text-muted);
	background: var(--bg-elevated);
}
.star {
	font-size: 9px;
	color: var(--accent);
}
</style>
