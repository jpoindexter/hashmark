<script lang="ts">
	import { appState } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import type { Session } from '$lib/types';

	let { onSelectSession, onNewSession } = $props<{
		onSelectSession: (s: Session) => void;
		onNewSession: () => void;
	}>();
</script>

<div class="welcome">
	<div class="welcome-inner">
		<div class="welcome-icon">
			<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
				<path d="M7 14h14M14 7v14" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
				<circle cx="14" cy="14" r="12" stroke="var(--accent)" stroke-width="1.5" opacity="0.3"/>
			</svg>
		</div>
		<h1 class="welcome-title">New agent conversation</h1>
		<p class="welcome-sub">Send a prompt below to start a new conversation{appState.projectPath ? ` in ${appState.projectPath.split('/').at(-1)}` : ''}.</p>

		<div class="shortcuts">
			<div class="shortcut-row">
				<kbd>⌘N</kbd>
				<span>new session</span>
			</div>
			<div class="shortcut-row">
				<kbd>⌘\</kbd>
				<span>toggle sidebar</span>
			</div>
			<div class="shortcut-row">
				<kbd>⌘,</kbd>
				<span>settings</span>
			</div>
			<div class="shortcut-row">
				<kbd>@</kbd>
				<span>mention a file</span>
			</div>
			<div class="shortcut-row">
				<kbd>⌘[</kbd> <kbd>⌘]</kbd>
				<span>switch session</span>
			</div>
		</div>
	</div>
</div>

<style>
.welcome {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	background: var(--bg-panel);
}

.welcome-inner {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	gap: 12px;
	padding: 40px 24px;
	max-width: 440px;
}

.welcome-icon {
	margin-bottom: 4px;
	opacity: 0.8;
}

.welcome-title {
	font-size: 20px;
	font-weight: 600;
	color: var(--text);
	letter-spacing: -0.01em;
	margin: 0;
}

.welcome-sub {
	font-size: 13px;
	color: var(--text-tertiary);
	line-height: 1.5;
	margin: 0;
}

.shortcuts {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-top: 20px;
	width: 100%;
	max-width: 280px;
}

.shortcut-row {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--text-tertiary);
}

.shortcut-row span {
	flex: 1;
	text-align: left;
}

kbd {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 28px;
	height: 20px;
	padding: 0 5px;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-family: var(--font-mono);
	font-size: 10px;
	color: var(--text-secondary);
	flex-shrink: 0;
}
</style>
