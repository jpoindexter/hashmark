<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { initTheme, initSettings } from '$lib/store.svelte';

	let { children } = $props();

	onMount(() => {
		initTheme();
		initSettings();
	});
</script>

<svelte:head>
	<title>hashmark</title>
</svelte:head>

{@render children()}
