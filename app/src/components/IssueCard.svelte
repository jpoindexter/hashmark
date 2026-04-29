<script lang="ts">
	import type { Issue } from '$lib/types';

	interface Props {
		issue: Issue;
		selected?: boolean;
		selMode?: boolean;
		dueSoonHighlight?: boolean;
		draggable?: boolean;
		onclick?: (issue: Issue) => void;
		ondragstart?: (e: DragEvent, issue: Issue) => void;
		ondragend?: () => void;
		onselect?: (id: string) => void;
	}

	let {
		issue,
		selected = false,
		selMode = false,
		dueSoonHighlight = false,
		draggable = false,
		onclick,
		ondragstart,
		ondragend,
		onselect,
	}: Props = $props();

	const PRIORITY_LABEL: Record<Issue['priority'], string> = {
		high: 'High',
		medium: 'Medium',
		low: 'Low',
	};

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

	const ds = $derived(dueDateStatus(issue.due_date));
</script>

<div
	class="card"
	class:due-soon-highlight={dueSoonHighlight}
	class:card-selected={selected}
	class:sel-mode={selMode}
	role="listitem"
	{draggable}
	ondragstart={ondragstart ? (e) => ondragstart!(e, issue) : undefined}
	ondragend={ondragend}
>
	<div class="card-top">
		<span class="drag-handle" aria-hidden="true">⠿</span>
		{#if onselect}
			<input
				type="checkbox"
				class="sel-checkbox card-checkbox"
				checked={selected}
				onchange={() => onselect!(issue.id)}
			/>
		{/if}
		<button class="card-title" onclick={() => onclick?.(issue)}>{issue.title}</button>
		<span class="priority-dot priority-{issue.priority}" title={PRIORITY_LABEL[issue.priority]}></span>
	</div>
	{#if issue.body}
		<p class="card-body">{issue.body.slice(0, 60)}{issue.body.length > 60 ? '…' : ''}</p>
	{/if}
	{#if issue.due_date}
		<div class="card-meta">
			<span
				class="due-badge"
				class:due-overdue={ds === 'overdue'}
				class:due-today={ds === 'today'}
				class:due-future={ds === 'future' || ds === 'soon'}
			>&#128197; {formatDueDate(issue.due_date)}</span>
		</div>
	{/if}
</div>

<style>
.card {
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	padding: 8px 10px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	transition: border-color var(--transition), box-shadow var(--transition);
	cursor: default;
}
.card:hover {
	border-color: var(--border-mid);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.card:hover .drag-handle { opacity: 0.4; }

.card.due-soon-highlight {
	border-left: 3px solid #ca8a04;
	background: color-mix(in srgb, #ca8a04 6%, var(--bg-elevated));
}
.card-selected {
	border-color: color-mix(in srgb, var(--accent) 50%, transparent) !important;
	background: color-mix(in srgb, var(--accent) 6%, var(--bg-elevated));
}

.drag-handle {
	font-size: 12px;
	color: var(--text-muted);
	cursor: grab;
	opacity: 0;
	transition: opacity var(--transition);
	flex-shrink: 0;
	line-height: 1;
	margin-right: 4px;
	user-select: none;
}
.drag-handle:active { cursor: grabbing; }

.card-top {
	display: flex;
	align-items: flex-start;
	gap: 6px;
}

.card-title {
	font-size: 12px;
	font-weight: 600;
	color: var(--text);
	line-height: 1.3;
	cursor: pointer;
	flex: 1;
	word-break: break-word;
}
.card-title:hover { color: var(--accent); }

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

.card-body {
	font-size: 11px;
	color: var(--text-muted);
	line-height: 1.4;
	margin: 0;
}

.card-meta {
	display: flex;
	align-items: center;
	gap: 4px;
	min-height: 16px;
}

.due-badge {
	font-size: 10px;
	line-height: 1;
	padding: 2px 5px;
	border-radius: var(--radius-sm);
	user-select: none;
}
.due-overdue { color: #ef4444; }
.due-today { color: #f97316; }
.due-future { color: var(--text-muted); }

.sel-checkbox {
	width: 13px;
	height: 13px;
	accent-color: var(--accent);
	cursor: pointer;
	flex-shrink: 0;
}
.card-checkbox {
	opacity: 0;
	transition: opacity var(--transition);
}
.card:hover .card-checkbox,
.card.sel-mode .card-checkbox,
.card.card-selected .card-checkbox {
	opacity: 1;
}
</style>
