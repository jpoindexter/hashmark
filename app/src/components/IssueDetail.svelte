<script lang="ts">
	import type { Issue } from '$lib/types';
	import { api } from '$lib/api';
	import { untrack } from 'svelte';

	interface Props {
		issue: Issue;
		onupdate?: (issue: Issue) => void;
		ondelete?: (id: string) => void;
		onclose?: () => void;
	}

	let { issue, onupdate, ondelete, onclose }: Props = $props();

	let title = $state(untrack(() => issue.title));
	let body = $state(untrack(() => issue.body ?? ''));
	let status = $state<Issue['status']>(untrack(() => issue.status));
	let priority = $state<Issue['priority']>(untrack(() => issue.priority));
	let dueDate = $state(untrack(() => issue.due_date ?? ''));
	let saving = $state(false);

	const STATUSES: Issue['status'][] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
	const STATUS_LABELS: Record<Issue['status'], string> = {
		backlog: 'Backlog',
		todo: 'To Do',
		in_progress: 'In Progress',
		in_review: 'In Review',
		done: 'Done',
	};

	async function save() {
		if (!title.trim() || saving) return;
		saving = true;
		try {
			await api.updateIssue(issue.id, {
				title: title.trim(),
				body: body.trim(),
				status,
				priority,
				due_date: dueDate || null,
			});
			const updated: Issue = {
				...issue,
				title: title.trim(),
				body: body.trim(),
				status,
				priority,
				due_date: dueDate || null,
				updated_at: Date.now(),
			};
			onupdate?.(updated);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!window.confirm(`Delete "${issue.title}"?`)) return;
		await api.deleteIssue(issue.id);
		ondelete?.(issue.id);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose?.();
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="detail-panel" role="dialog" aria-modal="true" aria-label="Edit issue">
	<div class="detail-header">
		<span class="detail-title-label">Edit Issue</span>
		<div class="detail-header-actions">
			<button class="delete-btn" onclick={handleDelete}>Delete</button>
			<button class="close-btn" aria-label="Close" onclick={onclose}>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	</div>

	<div class="detail-body">
		<input
			class="title-input"
			placeholder="Issue title"
			bind:value={title}
		/>
		<textarea
			class="body-input"
			placeholder="Description"
			bind:value={body}
			rows="5"
		></textarea>

		<div class="field-row">
			<label class="field-label" for="detail-status">Status</label>
			<select id="detail-status" class="field-select" bind:value={status}>
				{#each STATUSES as s}
					<option value={s}>{STATUS_LABELS[s]}</option>
				{/each}
			</select>
		</div>

		<div class="field-row">
			<label class="field-label" for="detail-priority">Priority</label>
			<select id="detail-priority" class="field-select" bind:value={priority}>
				<option value="low">Low</option>
				<option value="medium">Medium</option>
				<option value="high">High</option>
			</select>
		</div>

		<div class="field-row">
			<label class="field-label" for="detail-due-date">Due date</label>
			<input id="detail-due-date" class="field-date" type="date" bind:value={dueDate} />
		</div>
	</div>

	<div class="detail-footer">
		<button class="cancel-btn" onclick={onclose}>Cancel</button>
		<button class="save-btn" onclick={save} disabled={saving || !title.trim()}>
			{saving ? 'Saving…' : 'Save'}
		</button>
	</div>
</div>

<style>
.detail-panel {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 320px;
	background: var(--bg-panel);
	border-left: 1px solid var(--border-mid);
	display: flex;
	flex-direction: column;
	z-index: 10;
	box-shadow: -4px 0 16px rgba(0,0,0,0.15);
}

.detail-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}

.detail-title-label {
	font-size: 12px;
	font-weight: 600;
	color: var(--text-secondary);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.detail-header-actions {
	display: flex;
	align-items: center;
	gap: 6px;
}

.delete-btn {
	font-size: 12px;
	color: var(--red);
	padding: 3px 8px;
	border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
	border-radius: var(--radius-sm);
	transition: background var(--transition);
}
.delete-btn:hover {
	background: color-mix(in srgb, var(--red) 10%, transparent);
}

.close-btn {
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	color: var(--text-muted);
	transition: background var(--transition), color var(--transition);
}
.close-btn:hover {
	background: var(--bg-hover);
	color: var(--text);
}

.detail-body {
	flex: 1;
	overflow-y: auto;
	padding: 14px 16px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.title-input {
	width: 100%;
	font-size: 13px;
	font-weight: 600;
	color: var(--text);
	background: var(--bg-elevated);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	padding: 7px 10px;
	outline: none;
	transition: border-color var(--transition);
	box-sizing: border-box;
}
.title-input:focus { border-color: var(--accent); }

.body-input {
	width: 100%;
	font-size: 12px;
	color: var(--text);
	background: var(--bg-elevated);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	padding: 7px 10px;
	outline: none;
	resize: vertical;
	min-height: 80px;
	font-family: inherit;
	line-height: 1.5;
	transition: border-color var(--transition);
	box-sizing: border-box;
}
.body-input:focus { border-color: var(--accent); }

.field-row {
	display: flex;
	align-items: center;
	gap: 10px;
}

.field-label {
	font-size: 11px;
	color: var(--text-muted);
	width: 62px;
	flex-shrink: 0;
}

.field-select,
.field-date {
	flex: 1;
	font-size: 12px;
	color: var(--text);
	background: var(--bg-elevated);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-sm);
	padding: 5px 8px;
	outline: none;
	transition: border-color var(--transition);
	cursor: pointer;
}
.field-select:focus,
.field-date:focus { border-color: var(--accent); }
.field-date { color-scheme: dark; }

.detail-footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 6px;
	padding: 10px 16px;
	border-top: 1px solid var(--border);
	flex-shrink: 0;
}

.cancel-btn {
	font-size: 12px;
	color: var(--text-muted);
	padding: 5px 12px;
	border-radius: var(--radius-sm);
	transition: background var(--transition);
}
.cancel-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

.save-btn {
	font-size: 12px;
	color: #fff;
	background: var(--accent);
	padding: 5px 14px;
	border-radius: var(--radius-sm);
	transition: opacity var(--transition);
}
.save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.save-btn:hover:not(:disabled) { opacity: 0.85; }
</style>
