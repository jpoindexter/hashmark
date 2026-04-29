<script lang="ts">
	import { onMount } from 'svelte';
	import { appState } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import type { Issue } from '$lib/types';
	import IssueCard from './IssueCard.svelte';
	import IssueDetail from './IssueDetail.svelte';

	const STATUSES: Issue['status'][] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
	const STATUS_LABELS: Record<Issue['status'], string> = {
		backlog: 'Backlog',
		todo: 'To Do',
		in_progress: 'In Progress',
		in_review: 'In Review',
		done: 'Done',
	};

	let issues = $state<Issue[]>([]);
	let loading = $state(true);

	// View
	let viewMode = $state<'board' | 'list'>(
		(localStorage.getItem('hm-issues-view') as 'board' | 'list') ?? 'board'
	);
	function setViewMode(mode: 'board' | 'list') {
		viewMode = mode;
		localStorage.setItem('hm-issues-view', mode);
	}

	// Search
	let issueSearch = $state('');
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let dueSoonFilter = $state(false);

	// Detail panel
	let detailIssue = $state<Issue | null>(null);

	// New issue form
	let showForm = $state(false);
	let formTitle = $state('');
	let formBody = $state('');
	let formPriority = $state<Issue['priority']>('medium');
	let formDueDate = $state('');
	let formSaving = $state(false);

	// Multi-select
	let selectedIds = $state<Set<string>>(new Set());
	let bulkMoveTo = $state<Issue['status'] | ''>('');

	function toggleSelect(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) { next.delete(id); } else { next.add(id); }
		selectedIds = next;
	}

	function clearSelection() { selectedIds = new Set(); }

	async function bulkDelete() {
		const count = selectedIds.size;
		if (!window.confirm(`Delete ${count} issue${count !== 1 ? 's' : ''}?`)) return;
		const ids = [...selectedIds];
		await Promise.all(ids.map(id => api.deleteIssue(id)));
		issues = issues.filter(i => !ids.includes(i.id));
		clearSelection();
	}

	async function bulkMove() {
		if (!bulkMoveTo) return;
		const status = bulkMoveTo as Issue['status'];
		const ids = [...selectedIds];
		await Promise.all(ids.map(id => api.moveIssue(id, status)));
		issues = issues.map(i => ids.includes(i.id) ? { ...i, status } : i);
		clearSelection();
		bulkMoveTo = '';
	}

	// List sort
	type SortField = 'status' | 'priority' | 'due_date' | 'title';
	let sortField = $state<SortField>('status');

	const PRIORITY_ORDER: Record<Issue['priority'], number> = { high: 0, medium: 1, low: 2 };
	const STATUS_ORDER: Record<Issue['status'], number> = {
		backlog: 0, todo: 1, in_progress: 2, in_review: 3, done: 4
	};

	// Drag state
	let draggedId = $state<string | null>(null);
	let draggedFromStatus = $state<Issue['status'] | null>(null);
	let dragOverStatus = $state<Issue['status'] | null>(null);

	// Inline edit
	let editingId = $state<string | null>(null);
	let editValue = $state('');
	let datePickerId = $state<string | null>(null);

	// Template menu
	let templateMenuOpen = $state(false);

	type Template = { label: string; title: string; body: string; priority: Issue['priority'] };
	const TEMPLATES: Template[] = [
		{ label: 'Blank', title: '', body: '', priority: 'medium' },
		{ label: 'Bug report', title: 'Bug: ', body: '**Steps to reproduce:**\n1. \n\n**Expected:**\n\n**Actual:**\n', priority: 'high' },
		{ label: 'Feature request', title: 'Feature: ', body: '**User story:**\nAs a ___, I want ___ so that ___\n\n**Acceptance criteria:**\n- ', priority: 'medium' },
		{ label: 'Task', title: 'Task: ', body: '', priority: 'medium' },
	];

	function applyTemplate(t: Template) {
		formTitle = t.title;
		formBody = t.body;
		formPriority = t.priority;
		showForm = true;
		templateMenuOpen = false;
	}

	function matchesSearch(issue: Issue): boolean {
		if (!issueSearch) return true;
		const q = issueSearch.toLowerCase();
		return issue.title.toLowerCase().includes(q) || (issue.body ?? '').toLowerCase().includes(q);
	}

	function isSoonOrToday(issue: Issue): boolean {
		const s = dueDateStatus(issue.due_date);
		return s === 'soon' || s === 'today' || s === 'overdue';
	}

	function issuesFor(status: Issue['status']): Issue[] {
		return issues.filter(i => i.status === status && matchesSearch(i) && (!dueSoonFilter || isSoonOrToday(i)));
	}

	function sortedIssues(): Issue[] {
		const list = issues.filter(i => matchesSearch(i) && (!dueSoonFilter || isSoonOrToday(i)));
		return list.sort((a, b) => {
			if (sortField === 'status') {
				return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
			}
			if (sortField === 'priority') {
				return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
			}
			if (sortField === 'due_date') {
				return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
			}
			return a.title.localeCompare(b.title);
		});
	}

	function todayStr(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function dueDateStatus(due: string | null | undefined): 'overdue' | 'today' | 'soon' | 'future' | null {
		if (!due) return null;
		const today = todayStr();
		if (due < today) return 'overdue';
		if (due === today) return 'today';
		const dueMs = new Date(due).getTime();
		const todayMs = new Date(today).getTime();
		if (dueMs - todayMs <= 3 * 86400_000) return 'soon';
		return 'future';
	}

	function formatDueDate(due: string): string {
		const d = new Date(due + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// CRUD
	async function submitNewIssue() {
		if (!formTitle.trim()) return;
		formSaving = true;
		try {
			const issue = await api.createIssue({
				title: formTitle.trim(),
				body: formBody.trim(),
				priority: formPriority,
				due_date: formDueDate || null,
			});
			issues = [issue, ...issues];
			formTitle = '';
			formBody = '';
			formPriority = 'medium';
			formDueDate = '';
			showForm = false;
		} finally {
			formSaving = false;
		}
	}

	function cancelForm() {
		showForm = false;
		formTitle = '';
		formBody = '';
		formPriority = 'medium';
		formDueDate = '';
	}

	async function deleteIssue(issue: Issue) {
		if (!window.confirm(`Delete "${issue.title}"?`)) return;
		await api.deleteIssue(issue.id);
		issues = issues.filter(i => i.id !== issue.id);
		if (detailIssue?.id === issue.id) detailIssue = null;
	}

	async function moveLeft(issue: Issue) {
		const idx = STATUSES.indexOf(issue.status);
		if (idx <= 0) return;
		const next = STATUSES[idx - 1];
		await api.moveIssue(issue.id, next);
		issues = issues.map(i => i.id === issue.id ? { ...i, status: next } : i);
	}

	async function moveRight(issue: Issue) {
		const idx = STATUSES.indexOf(issue.status);
		if (idx >= STATUSES.length - 1) return;
		const next = STATUSES[idx + 1];
		await api.moveIssue(issue.id, next);
		issues = issues.map(i => i.id === issue.id ? { ...i, status: next } : i);
	}

	function startEdit(issue: Issue) {
		editingId = issue.id;
		editValue = issue.title;
	}

	async function commitEdit(issue: Issue) {
		if (!editingId) return;
		const title = editValue.trim();
		editingId = null;
		if (!title || title === issue.title) return;
		await api.updateIssue(issue.id, {
			title,
			body: issue.body,
			status: issue.status,
			priority: issue.priority,
			due_date: issue.due_date ?? null,
		});
		issues = issues.map(i => i.id === issue.id ? { ...i, title } : i);
	}

	function onEditKeydown(e: KeyboardEvent, issue: Issue) {
		if (e.key === 'Enter') { e.preventDefault(); commitEdit(issue); }
		else if (e.key === 'Escape') { editingId = null; }
	}

	async function updateDueDate(issue: Issue, value: string) {
		const due_date = value || null;
		await api.updateIssue(issue.id, {
			title: issue.title,
			body: issue.body,
			status: issue.status,
			priority: issue.priority,
			due_date,
		});
		issues = issues.map(i => i.id === issue.id ? { ...i, due_date } : i);
	}

	async function startSession(issue: Issue) {
		const session = await api.createSession({ title: issue.title });
		appState.fileInsert = `Working on issue: ${issue.title}\n\n${issue.body}`;
		appState.activeSessionId = session.id;
		appState.messages = [];
		appState.issuesOpen = false;
	}

	// Drag-drop
	function onDragStart(e: DragEvent, issue: Issue) {
		draggedId = issue.id;
		draggedFromStatus = issue.status;
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragEnd() {
		draggedId = null;
		draggedFromStatus = null;
		dragOverStatus = null;
	}

	function onDragOver(e: DragEvent, status: Issue['status']) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverStatus = status;
	}

	function onDragLeave(e: DragEvent, status: Issue['status']) {
		const related = e.relatedTarget as Node | null;
		const target = e.currentTarget as HTMLElement;
		if (related && target.contains(related)) return;
		if (dragOverStatus === status) dragOverStatus = null;
	}

	async function onDrop(e: DragEvent, targetStatus: Issue['status']) {
		e.preventDefault();
		dragOverStatus = null;
		if (!draggedId || draggedFromStatus === targetStatus) {
			draggedId = null;
			draggedFromStatus = null;
			return;
		}
		const id = draggedId;
		draggedId = null;
		draggedFromStatus = null;
		await api.moveIssue(id, targetStatus);
		issues = issues.map(i => i.id === id ? { ...i, status: targetStatus } : i);
	}

	// Panel open/close
	function close() { appState.issuesOpen = false; }
	function onBackdropClick() { close(); }
	function onPanelClick(e: MouseEvent) { e.stopPropagation(); }

	function checkIssuePrefill() {
		const raw = sessionStorage.getItem('hm-issue-prefill');
		if (!raw) return;
		try {
			const prefill = JSON.parse(raw) as { title: string; body: string };
			formTitle = prefill.title;
			formBody = prefill.body;
			showForm = true;
			sessionStorage.removeItem('hm-issue-prefill');
		} catch {}
	}

	$effect(() => { if (appState.issuesOpen) checkIssuePrefill(); });

	onMount(async () => {
		checkIssuePrefill();
		try {
			issues = await api.listIssues();
		} finally {
			loading = false;
		}
	});

	function isInputFocused(): boolean {
		const el = document.activeElement;
		if (!el) return false;
		const tag = el.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === '/' && !isInputFocused()) {
			e.preventDefault();
			searchInputEl?.focus();
			return;
		}
		if (isInputFocused()) return;
		if (e.key === 'n') { e.preventDefault(); applyTemplate(TEMPLATES[0]); }
		else if (e.key === 'b') { e.preventDefault(); setViewMode('board'); }
		else if (e.key === 'l') { e.preventDefault(); setViewMode('list'); }
		else if (e.key === 'Escape') {
			if (detailIssue) { detailIssue = null; return; }
			if (issueSearch) { e.preventDefault(); issueSearch = ''; }
		}
	}
</script>

<svelte:window
	onkeydown={onWindowKeydown}
	onclick={(e) => {
		const t = e.target as HTMLElement;
		if (templateMenuOpen && !t.closest('.new-btn-wrap')) templateMenuOpen = false;
	}}
/>

<button class="backdrop" aria-label="Close issues" onclick={onBackdropClick}></button>

<div class="panel" role="dialog" aria-modal="true" tabindex="-1" onclick={onPanelClick} onkeydown={(e) => e.stopPropagation()}>
	<div class="panel-header">
		<span class="panel-title">Issues</span>
		<div class="header-actions">
			<button
				class="due-soon-btn"
				class:active={dueSoonFilter}
				onclick={() => dueSoonFilter = !dueSoonFilter}
				title="Show cards due within 3 days"
			>Due soon</button>
			<div class="view-toggle">
				<button
					class="view-btn"
					class:active={viewMode === 'board'}
					onclick={() => setViewMode('board')}
					title="Board (b)"
				>
					<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
						<rect x="0.5" y="0.5" width="4" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
						<rect x="6.5" y="0.5" width="4" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
						<rect x="0.5" y="7.5" width="4" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
						<rect x="6.5" y="7.5" width="4" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
					</svg>
				</button>
				<button
					class="view-btn"
					class:active={viewMode === 'list'}
					onclick={() => setViewMode('list')}
					title="List (l)"
				>
					<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
						<line x1="3" y1="2.5" x2="12" y2="2.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
						<line x1="3" y1="6.5" x2="12" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
						<line x1="3" y1="10.5" x2="12" y2="10.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
						<circle cx="1" cy="2.5" r="0.8" fill="currentColor"/>
						<circle cx="1" cy="6.5" r="0.8" fill="currentColor"/>
						<circle cx="1" cy="10.5" r="0.8" fill="currentColor"/>
					</svg>
				</button>
			</div>
			<div class="search-wrap">
				<input
					bind:this={searchInputEl}
					class="search-input"
					placeholder="Search… (/)"
					bind:value={issueSearch}
				/>
				{#if issueSearch}
					<button class="search-clear" onclick={() => { issueSearch = ''; searchInputEl?.focus(); }}>×</button>
				{/if}
			</div>
			<div class="new-btn-wrap">
				<button class="new-btn" onclick={() => templateMenuOpen = !templateMenuOpen}>+ New</button>
				{#if templateMenuOpen}
					<div class="template-menu">
						{#each TEMPLATES as t}
							<button class="template-item" role="menuitem" onclick={() => applyTemplate(t)}>
								{t.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<button class="close-btn" aria-label="Close" onclick={close}>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	</div>

	{#if showForm}
		<div class="form-bar">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="form-input"
				placeholder="Issue title"
				bind:value={formTitle}
				autofocus
			/>
			<textarea
				class="form-textarea"
				placeholder="Description (optional)"
				bind:value={formBody}
				rows="2"
			></textarea>
			<div class="form-row">
				<select class="form-select" bind:value={formPriority}>
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
				<input class="form-date" type="date" bind:value={formDueDate} title="Due date" />
				<div class="form-btns">
					<button class="cancel-btn" onclick={cancelForm}>Cancel</button>
					<button class="save-btn" onclick={submitNewIssue} disabled={formSaving || !formTitle.trim()}>
						{formSaving ? 'Saving...' : 'Create'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if selectedIds.size > 0}
		<div class="bulk-bar">
			<label class="bulk-select-all">
				<input type="checkbox" checked={true} onclick={clearSelection} title="Deselect all" />
				<span>{selectedIds.size} selected</span>
			</label>
			<div class="bulk-actions">
				<select class="bulk-move-select" bind:value={bulkMoveTo} onchange={bulkMove}>
					<option value="">Move to →</option>
					{#each STATUSES as s}
						<option value={s}>{STATUS_LABELS[s]}</option>
					{/each}
				</select>
				<button class="bulk-delete-btn" onclick={bulkDelete}>Delete</button>
				<button class="bulk-deselect-btn" onclick={clearSelection}>×</button>
			</div>
		</div>
	{/if}

	<div class="panel-body" style="position:relative">
		{#if loading}
			<div class="empty-state">Loading...</div>
		{:else if viewMode === 'list'}
			<div class="list-view">
				<div class="list-sort-bar">
					<span class="list-sort-label">Sort by</span>
					{#each (['status', 'priority', 'due_date', 'title'] as const) as field}
						<button
							class="sort-btn"
							class:active={sortField === field}
							onclick={() => sortField = field}
						>{{ status: 'Status', priority: 'Priority', due_date: 'Due date', title: 'Title' }[field]}</button>
					{/each}
				</div>
				<div class="list-table">
					<div class="list-head">
						<span class="lh-check">
							<input
								type="checkbox"
								class="sel-checkbox"
								checked={sortedIssues().length > 0 && sortedIssues().every(i => selectedIds.has(i.id))}
								onchange={() => {
									const all = sortedIssues().every(i => selectedIds.has(i.id));
									if (all) { clearSelection(); } else { selectedIds = new Set(sortedIssues().map(i => i.id)); }
								}}
								title="Select all"
							/>
						</span>
						<span class="lh-priority"></span>
						<span class="lh-title">Title</span>
						<span class="lh-status">Status</span>
						<span class="lh-due">Due</span>
						<span class="lh-actions"></span>
					</div>
					{#each sortedIssues() as issue (issue.id)}
						{@const ds = dueDateStatus(issue.due_date)}
						<div
							class="list-row"
							class:due-soon-highlight={dueSoonFilter && isSoonOrToday(issue)}
							class:row-selected={selectedIds.has(issue.id)}
							class:sel-mode={selectedIds.size > 0}
						>
							<span class="lr-check">
								<input type="checkbox" class="sel-checkbox" checked={selectedIds.has(issue.id)} onchange={() => toggleSelect(issue.id)} />
							</span>
							<span class="lr-priority priority-dot priority-{issue.priority}"></span>
							<span class="lr-title">
								{#if editingId === issue.id}
									<!-- svelte-ignore a11y_autofocus -->
									<input class="card-edit-input" bind:value={editValue} onkeydown={(e) => onEditKeydown(e, issue)} onblur={() => commitEdit(issue)} autofocus />
								{:else}
									<button class="lr-title-text" onclick={() => startEdit(issue)}>{issue.title}</button>
								{/if}
							</span>
							<span class="lr-status">
								<span class="status-badge status-{issue.status}">{STATUS_LABELS[issue.status]}</span>
							</span>
							<span class="lr-due" class:lr-due-overdue={ds === 'overdue'}>
								{#if issue.due_date}
									{#if datePickerId === issue.id}
										<!-- svelte-ignore a11y_autofocus -->
										<input
											class="card-date-input"
											type="date"
											value={issue.due_date ?? ''}
											onchange={(e) => { updateDueDate(issue, (e.currentTarget as HTMLInputElement).value); datePickerId = null; }}
											onblur={() => datePickerId = null}
											autofocus
										/>
									{:else}
												<button class="lr-date-text" onclick={() => (datePickerId = issue.id)} title="Click to change">{formatDueDate(issue.due_date)}</button>
									{/if}
								{:else}
										<button class="lr-no-date" onclick={() => (datePickerId = issue.id)}>+ date</button>
								{/if}
							</span>
							<span class="lr-actions">
								<button class="arrow-btn" onclick={() => moveLeft(issue)} disabled={STATUSES.indexOf(issue.status) === 0} title="Move left">←</button>
								<button class="arrow-btn" onclick={() => moveRight(issue)} disabled={STATUSES.indexOf(issue.status) === STATUSES.length - 1} title="Move right">→</button>
								<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
								<button class="trash-btn" onclick={() => deleteIssue(issue)} title="Delete" aria-label="Delete issue">
									<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 3h8M4 3V2h3v1M2.5 3l.5 6h5l.5-6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
								</button>
								<button class="start-session-btn" onclick={() => startSession(issue)} title="Start session">Start →</button>
							</span>
						</div>
					{/each}
					{#if sortedIssues().length === 0}
						<div class="list-empty">No issues</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="board">
				{#each STATUSES as status}
					{@const cols = issuesFor(status)}
					<div
						class="column"
						class:drop-target={dragOverStatus === status}
						role="region"
						aria-label={STATUS_LABELS[status]}
						ondragover={(e) => onDragOver(e, status)}
						ondragleave={(e) => onDragLeave(e, status)}
						ondrop={(e) => onDrop(e, status)}
					>
						<div class="col-header">
							<span class="col-title">{STATUS_LABELS[status]}</span>
							<span class="col-count">{cols.length}</span>
						</div>
						<div class="col-cards">
							{#each cols as issue (issue.id)}
								<IssueCard
									{issue}
									selected={selectedIds.has(issue.id)}
									selMode={selectedIds.size > 0}
									dueSoonHighlight={dueSoonFilter && isSoonOrToday(issue)}
									draggable={true}
									onclick={(iss) => { detailIssue = iss; }}
									ondragstart={onDragStart}
									ondragend={onDragEnd}
									onselect={toggleSelect}
								/>
							{/each}
							{#if cols.length === 0}
								<div class="col-empty">Empty</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if detailIssue}
			<IssueDetail
				issue={detailIssue}
				onupdate={(updated) => {
					issues = issues.map(i => i.id === updated.id ? updated : i);
					detailIssue = updated;
				}}
				ondelete={(id) => {
					issues = issues.filter(i => i.id !== id);
					detailIssue = null;
				}}
				onclose={() => (detailIssue = null)}
			/>
		{/if}
	</div>
</div>

<style>
.backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	z-index: 200;
	animation: fade-in 120ms ease;
}

.panel {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 900px;
	max-width: calc(100vw - 32px);
	height: 85vh;
	max-height: 85vh;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-xl);
	box-shadow: var(--shadow-overlay);
	z-index: 201;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	animation: slide-up 160ms ease;
}

@keyframes fade-in {
	from { opacity: 0; }
	to { opacity: 1; }
}

@keyframes slide-up {
	from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); }
	to { opacity: 1; transform: translate(-50%, -50%); }
}

.panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 18px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}

.panel-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--text);
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.panel-body {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

/* Due soon button */
.due-soon-btn {
	font-size: 12px;
	color: var(--text-muted);
	padding: 4px 10px;
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	transition: background var(--transition), color var(--transition), border-color var(--transition);
}
.due-soon-btn:hover {
	background: var(--bg-hover);
	color: var(--text-secondary);
}
.due-soon-btn.active {
	color: #ca8a04;
	border-color: #ca8a04;
	background: color-mix(in srgb, #ca8a04 10%, transparent);
}

/* View toggle */
.view-toggle {
	display: flex;
	align-items: center;
	gap: 2px;
	background: var(--bg-elevated);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	padding: 2px;
}

.view-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 3px;
	color: var(--text-muted);
	transition: background var(--transition), color var(--transition);
}
.view-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.view-btn.active {
	background: var(--bg-hover);
	color: var(--accent);
	border: 1px solid var(--accent);
}

/* Search */
.search-wrap {
	position: relative;
	display: flex;
	align-items: center;
}

.search-input {
	font-size: 12px;
	color: var(--text);
	background: var(--bg-elevated);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	padding: 4px 24px 4px 8px;
	outline: none;
	width: 140px;
	transition: border-color var(--transition), width var(--transition);
}
.search-input::placeholder { color: var(--text-muted); }
.search-input:focus { border-color: var(--accent); width: 180px; }

.search-clear {
	position: absolute;
	right: 6px;
	font-size: 14px;
	line-height: 1;
	color: var(--text-muted);
	cursor: pointer;
	padding: 0 2px;
	transition: color var(--transition);
}
.search-clear:hover { color: var(--text); }

/* New button + template menu */
.new-btn-wrap { position: relative; }

.new-btn {
	font-size: 12px;
	color: var(--accent);
	padding: 4px 10px;
	border: 1px solid var(--accent);
	border-radius: var(--radius-sm);
	transition: background var(--transition), color var(--transition);
}
.new-btn:hover { background: var(--accent); color: #fff; }

.template-menu {
	position: absolute;
	top: calc(100% + 4px);
	right: 0;
	background: var(--bg-card);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	z-index: 200;
	min-width: 148px;
	overflow: hidden;
	box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.template-item {
	padding: 7px 12px;
	font-size: 12px;
	color: var(--text-secondary);
	cursor: pointer;
	white-space: nowrap;
}
.template-item:hover { background: var(--bg-hover); color: var(--text-primary); }

/* Close button */
.close-btn {
	width: 26px;
	height: 26px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-muted);
	transition: background var(--transition), color var(--transition);
}
.close-btn:hover { background: var(--bg-hover); color: var(--text); }

/* New issue form */
.form-bar {
	padding: 12px 18px;
	border-bottom: 1px solid var(--border);
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex-shrink: 0;
}

.form-input, .form-textarea, .form-select, .form-date {
	background: var(--bg-elevated);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	color: var(--text);
	font-size: 13px;
	padding: 6px 10px;
	outline: none;
	transition: border-color var(--transition);
}
.form-input:focus, .form-textarea:focus { border-color: var(--accent); }
.form-textarea { resize: vertical; min-height: 48px; font-family: inherit; }
.form-date { color-scheme: dark; cursor: pointer; }

.form-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.form-btns { display: flex; gap: 6px; }

.cancel-btn {
	font-size: 12px;
	color: var(--text-muted);
	padding: 4px 10px;
	border-radius: var(--radius-sm);
	transition: background var(--transition);
}
.cancel-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

.save-btn {
	font-size: 12px;
	color: #fff;
	background: var(--accent);
	padding: 4px 12px;
	border-radius: var(--radius-sm);
	transition: opacity var(--transition);
}
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Bulk bar */
.bulk-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 18px;
	background: var(--bg-elevated);
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}

.bulk-select-all {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--text-secondary);
	cursor: pointer;
	user-select: none;
}

.bulk-actions { display: flex; align-items: center; gap: 6px; }

.bulk-move-select {
	font-size: 12px;
	color: var(--text-secondary);
	background: var(--bg-card);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	padding: 4px 8px;
	cursor: pointer;
}
.bulk-move-select:focus { outline: none; border-color: var(--accent); }

.bulk-delete-btn {
	font-size: 12px;
	color: var(--red);
	border: 1px solid var(--red);
	border-radius: var(--radius-sm);
	padding: 4px 10px;
	transition: background var(--transition);
}
.bulk-delete-btn:hover { background: color-mix(in srgb, var(--red) 12%, transparent); }

.bulk-deselect-btn {
	font-size: 14px;
	color: var(--text-muted);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	width: 26px;
	height: 26px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background var(--transition);
}
.bulk-deselect-btn:hover { background: var(--bg-hover); color: var(--text); }

/* Shared checkbox */
.sel-checkbox {
	width: 13px;
	height: 13px;
	accent-color: var(--accent);
	cursor: pointer;
	flex-shrink: 0;
}

/* Empty / loading */
.empty-state {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--text-muted);
	font-size: 13px;
}

/* Board */
.board {
	display: flex;
	flex: 1;
	overflow-x: auto;
	overflow-y: hidden;
	gap: 0;
	padding: 16px;
}

.column {
	flex: 0 0 160px;
	min-width: 160px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	border: 1px solid transparent;
	border-radius: var(--radius-md);
	padding: 4px;
	transition: border-color var(--transition), background var(--transition);
}
.column + .column { margin-left: 12px; }
.column.drop-target {
	border: 1px dashed var(--accent);
	background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.col-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 4px;
	padding: 0 2px 6px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}

.col-title {
	font-size: 11px;
	font-weight: 600;
	color: var(--text-secondary);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.col-count {
	font-size: 11px;
	color: var(--text-muted);
	background: var(--bg-elevated);
	border-radius: 10px;
	padding: 0 6px;
	min-width: 18px;
	text-align: center;
	user-select: none;
}

.col-cards {
	flex: 1;
	overflow-y: auto;
	scrollbar-width: thin;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-right: 2px;
}

.col-empty {
	font-size: 11px;
	color: var(--text-muted);
	text-align: center;
	padding: 12px 0;
}

/* List view */
.list-view {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.list-sort-bar {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 8px 18px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}

.list-sort-label {
	font-size: 11px;
	color: var(--text-muted);
	margin-right: 4px;
}

.sort-btn {
	font-size: 11px;
	color: var(--text-muted);
	padding: 3px 8px;
	border-radius: var(--radius-sm);
	border: 1px solid transparent;
	transition: background var(--transition), color var(--transition), border-color var(--transition);
}
.sort-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.sort-btn.active {
	color: var(--accent);
	border-color: var(--accent);
	background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.list-table {
	flex: 1;
	overflow-y: auto;
	scrollbar-width: thin;
}

.list-head {
	display: grid;
	grid-template-columns: 28px 14px 1fr 110px 80px 100px;
	align-items: center;
	padding: 6px 18px;
	border-bottom: 1px solid var(--border);
	font-size: 10px;
	font-weight: 600;
	color: var(--text-muted);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	position: sticky;
	top: 0;
	background: var(--bg-panel);
}

.list-row {
	display: grid;
	grid-template-columns: 28px 14px 1fr 110px 80px 100px;
	align-items: center;
	padding: 7px 18px;
	border-bottom: 1px solid var(--border);
	transition: background var(--transition);
}
.list-row:hover { background: var(--bg-elevated); }
.list-row:hover .lr-actions { opacity: 1; }
.list-row.due-soon-highlight {
	border-left: 3px solid #ca8a04;
	background: color-mix(in srgb, #ca8a04 4%, transparent);
}
.row-selected {
	background: color-mix(in srgb, var(--accent) 6%, transparent);
	border-left: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
}

.lh-check, .lr-check {
	width: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.lr-check .sel-checkbox {
	opacity: 0;
	transition: opacity var(--transition);
}
.list-row:hover .lr-check .sel-checkbox,
.list-row.sel-mode .lr-check .sel-checkbox,
.list-row.row-selected .lr-check .sel-checkbox { opacity: 1; }

.lr-priority { flex-shrink: 0; }

.lr-title {
	min-width: 0;
	display: flex;
	align-items: center;
}

.lr-title-text {
	font-size: 12px;
	font-weight: 500;
	color: var(--text);
	cursor: pointer;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.lr-title-text:hover { color: var(--accent); }

.lr-status { display: flex; align-items: center; }

.lr-due {
	font-size: 11px;
	color: var(--text-muted);
	cursor: default;
}
.lr-due-overdue { color: #ef4444; }

.lr-no-date {
	font-size: 11px;
	color: var(--text-muted);
	opacity: 0.4;
	cursor: pointer;
}
.lr-no-date:hover { opacity: 1; }

.lr-actions {
	display: flex;
	align-items: center;
	gap: 4px;
	opacity: 0;
	transition: opacity var(--transition);
}

.list-empty {
	padding: 32px;
	text-align: center;
	font-size: 13px;
	color: var(--text-muted);
}

/* Shared card/list elements */
.card-edit-input {
	flex: 1;
	font-size: 12px;
	font-weight: 600;
	color: var(--text);
	background: var(--bg-panel);
	border: 1px solid var(--accent);
	border-radius: var(--radius-sm);
	padding: 1px 4px;
	outline: none;
	min-width: 0;
}

.card-date-input {
	font-size: 11px;
	background: var(--bg-panel);
	border: 1px solid var(--accent);
	border-radius: var(--radius-sm);
	color: var(--text);
	padding: 3px 6px;
	outline: none;
	color-scheme: dark;
}

.priority-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	flex-shrink: 0;
	margin-top: 3px;
}
.priority-high { background: var(--red); }
.priority-medium { background: var(--yellow); }
.priority-low { background: var(--text-muted); }

.status-badge {
	font-size: 10px;
	font-weight: 500;
	padding: 2px 7px;
	border-radius: var(--radius-sm);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	white-space: nowrap;
}
.status-backlog { color: var(--text-muted); background: var(--bg-hover); }
.status-todo { color: #60a5fa; background: color-mix(in srgb, #60a5fa 12%, transparent); }
.status-in_progress { color: var(--yellow); background: color-mix(in srgb, var(--yellow) 12%, transparent); }
.status-in_review { color: #a78bfa; background: color-mix(in srgb, #a78bfa 12%, transparent); }
.status-done { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }

.arrow-btn {
	font-size: 12px;
	color: var(--text-muted);
	padding: 1px 5px;
	border-radius: var(--radius-sm);
	line-height: 1;
	transition: background var(--transition), color var(--transition);
}
.arrow-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-secondary); }
.arrow-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.trash-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border-radius: var(--radius-sm);
	color: var(--text-muted);
	margin-left: auto;
	transition: background var(--transition), color var(--transition);
	cursor: pointer;
}
.trash-btn:hover {
	background: color-mix(in srgb, var(--red) 12%, transparent);
	color: var(--red);
}

.start-session-btn {
	font-size: 11px;
	color: var(--accent);
	padding: 2px 7px;
	border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	border-radius: var(--radius-sm);
	line-height: 1;
	opacity: 0;
	transition: opacity var(--transition), background var(--transition), color var(--transition);
	white-space: nowrap;
}
.list-row:hover .start-session-btn { opacity: 1; }
.start-session-btn:hover {
	background: color-mix(in srgb, var(--accent) 12%, transparent);
}
</style>
