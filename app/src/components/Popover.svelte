<script lang="ts">
	import type { Snippet } from 'svelte';
	import { appState } from '$lib/store.svelte';
	import { closePopover, type PopoverId } from '$lib/popovers.svelte';

	let { id, width = 220, children }: { id: PopoverId; width?: number; children?: Snippet } = $props();

	let popEl = $state<HTMLDivElement | null>(null);

	function computeStyle(): string {
		const rect = appState.popoverRect;
		if (!rect) return 'display:none';
		const margin = 6;
		const align = appState.popoverAlign;

		let left: number;
		if (align === 'right') {
			left = rect.right - width;
		} else if (align === 'center') {
			left = rect.left + rect.width / 2 - width / 2;
		} else {
			left = rect.left;
		}
		left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

		const estimatedHeight = 220;
		const spaceBelow = window.innerHeight - rect.bottom - margin;
		const top = spaceBelow >= estimatedHeight
			? rect.bottom + margin
			: rect.top - estimatedHeight - margin;

		return `top:${Math.max(8, top)}px;left:${left}px;width:${width}px`;
	}

	function onDocClick(e: MouseEvent) {
		if (appState.popoverId !== id) return;
		const target = e.target as Node;
		if (popEl && !popEl.contains(target)) closePopover();
	}
</script>

<svelte:document onclick={onDocClick} />

{#if appState.popoverId === id}
	<div
		bind:this={popEl}
		class="popover"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		style={computeStyle()}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		{@render children?.()}
	</div>
{/if}

<style>
.popover {
	position: fixed;
	z-index: 500;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-overlay);
	padding: 4px 0;
	animation: pop-in 90ms ease;
	overflow: hidden;
}

@keyframes pop-in {
	from { opacity: 0; transform: translateY(3px); }
	to   { opacity: 1; transform: translateY(0); }
}
</style>
