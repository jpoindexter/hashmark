<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    name: string;
    size?: number;
    class?: string;
  }

  let { name, size = 14, class: cls = '' }: Props = $props();

  let svg = $state('');

  const cache = new Map<string, string>();

  async function load(iconName: string) {
    if (cache.has(iconName)) {
      svg = cache.get(iconName)!;
      return;
    }
    try {
      const res = await fetch(`/icons/${iconName}.svg`);
      if (!res.ok) return;
      let raw = await res.text();
      // strip hard-coded fills so CSS currentColor works
      raw = raw.replace(/\s+fill="(?!none)[^"]*"/g, ' fill="currentColor"');
      raw = raw.replace(/\s+fill-opacity="[^"]*"/g, '');
      // fix width/height to 1em so CSS font-size scales it
      raw = raw.replace(/\s+width="[^"]*"/, '');
      raw = raw.replace(/\s+height="[^"]*"/, '');
      cache.set(iconName, raw);
      svg = raw;
    } catch { /* silently skip missing icons */ }
  }

  $effect(() => { load(name); });
</script>

<span
  class="icon {cls}"
  style="--sz: {size}px; width: {size}px; height: {size}px;"
  aria-hidden="true"
>
  {@html svg}
</span>

<style>
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: inherit;
  }
  .icon :global(svg) {
    width: var(--sz);
    height: var(--sz);
    fill: currentColor;
  }
</style>
