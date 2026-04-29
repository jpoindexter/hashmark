import { appState, type PopoverId } from './store.svelte';
export type { PopoverId };

export function openPopover(id: PopoverId, anchor: HTMLElement, align: 'left' | 'right' | 'center' = 'left') {
	const r = anchor.getBoundingClientRect();
	appState.popoverId = id;
	appState.popoverRect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
	appState.popoverAlign = align;
}

export function closePopover() {
	appState.popoverId = null;
	appState.popoverRect = null;
}

export function togglePopover(id: PopoverId, anchor: HTMLElement, align: 'left' | 'right' | 'center' = 'left') {
	if (appState.popoverId === id) {
		closePopover();
	} else {
		openPopover(id, anchor, align);
	}
}
