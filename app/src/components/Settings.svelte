<script lang="ts">
	import { onMount } from 'svelte';
	import { appState, setTheme, initSettings, setProject, getRecentProjects } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import type { ProviderInfo } from '$lib/types';
	import { browser } from '$app/environment';

	// ── Tab ──────────────────────────────────────────────────────────────────
	type Tab = 'appearance' | 'providers' | 'ai' | 'prompts' | 'preconfigs' | 'security';
	let activeTab = $state<Tab>('appearance');

	// ── Providers ────────────────────────────────────────────────────────────
	let providers = $state<ProviderInfo[]>([]);
	let keys = $state<Record<string, string>>({});
	let saving = $state<Record<string, boolean>>({});
	let saved = $state<Record<string, boolean>>({});
	let keyVisible = $state<Record<string, boolean>>({});
	let keyValid = $state<Record<string, boolean | null>>({});
	let keyDates = $state<Record<string, number>>(
		(() => { try { return JSON.parse((browser ? localStorage.getItem('hm-key-dates') : null) ?? '{}') as Record<string, number>; } catch { return {}; } })()
	);

	const KEY_PATTERNS: Record<string, RegExp> = {
		anthropic: /^(sk-ant-|sk-)[a-zA-Z0-9_-]{20,}$|^[A-Za-z0-9_-]{40,}$/,
		openai: /^sk-[a-zA-Z0-9]{20,}$/,
		gemini: /^AIza[a-zA-Z0-9_-]{35,}$/,
		groq: /^gsk_[a-zA-Z0-9]{40,}$/,
		mistral: /^[a-zA-Z0-9]{32,}$/,
		xai: /^xai-[a-zA-Z0-9_-]{20,}$/,
		deepseek: /^sk-[a-zA-Z0-9]{20,}$/,
		openrouter: /^sk-or-[a-zA-Z0-9_-]{20,}$/,
	};

	function validateKeyFormat(id: string, val: string): boolean | null {
		if (!val || val === '••••••••••••••••') return null;
		const pattern = KEY_PATTERNS[id];
		if (!pattern) return val.length >= 8;
		return pattern.test(val);
	}

	function keyAgeDays(id: string): number | null {
		const ts = keyDates[id];
		if (!ts) return null;
		return Math.floor((Date.now() - ts) / 86400000);
	}

	function keyAgeLabel(id: string): string {
		const days = keyAgeDays(id);
		if (days === null) return '';
		if (days === 0) return 'Set today';
		if (days === 1) return 'Set 1 day ago';
		return `Set ${days} days ago`;
	}

	// ── Appearance ───────────────────────────────────────────────────────────
	const COLOR_SCHEMES = [
		{ id: 'neutral',   label: 'Neutral',   accent: '#6b7280', vars: { '--accent': '#6b7280' } },
		{ id: 'ocean',     label: 'Ocean',     accent: '#0ea5e9', vars: { '--accent': '#0ea5e9' } },
		{ id: 'forest',    label: 'Forest',    accent: '#16a34a', vars: { '--accent': '#16a34a' } },
		{ id: 'sunset',    label: 'Sunset',    accent: '#f97316', vars: { '--accent': '#f97316' } },
		{ id: 'amethyst',  label: 'Amethyst',  accent: '#8b5cf6', vars: { '--accent': '#8b5cf6' } },
	] as const;
	type SchemeId = typeof COLOR_SCHEMES[number]['id'];
	let activeScheme = $state<SchemeId | null>(
		(browser ? localStorage.getItem('hm-scheme') : null) as SchemeId | null
	);

	function applyScheme(id: SchemeId) {
		const scheme = COLOR_SCHEMES.find(s => s.id === id);
		if (!scheme) return;
		activeScheme = id;
		localStorage.setItem('hm-scheme', id);
		selectAccent(scheme.accent);
	}
	function clearScheme() {
		activeScheme = null;
		localStorage.removeItem('hm-scheme');
	}

	const ACCENT_PRESETS = [
		{ color: '#3b82f6', label: 'Blue' },
		{ color: '#8b5cf6', label: 'Purple' },
		{ color: '#10b981', label: 'Green' },
		{ color: '#f97316', label: 'Orange' },
		{ color: '#ef4444', label: 'Red' },
		{ color: '#ec4899', label: 'Pink' },
		{ color: '#06b6d4', label: 'Cyan' },
		{ color: '#f59e0b', label: 'Gold' },
	] as const;

	const DEFAULT_ACCENT = '#8b5cf6';
	const DEFAULT_BORDER_RADIUS = 6;
	const DEFAULT_SIDEBAR_WIDTH = 260;
	const DEFAULT_FONT_SIZE = 14;
	const DEFAULT_LINE_HEIGHT = 1.6;

	let hexInput = $state<string>((browser ? localStorage.getItem('hm-accent') : null) ?? DEFAULT_ACCENT);
	let borderRadius = $state<number>(Number((browser ? localStorage.getItem('hm-border-radius') : null) ?? DEFAULT_BORDER_RADIUS));
	let fontFamily = $state<string>((browser ? localStorage.getItem('hm-font') : null) ?? 'system');
	let sidebarWidth = $state<number>(Number((browser ? localStorage.getItem('hm-sidebar-width') : null) ?? DEFAULT_SIDEBAR_WIDTH));
	let fontSize = $state<number>(Number((browser ? localStorage.getItem('hm-ui-font-size') : null) ?? DEFAULT_FONT_SIZE));
	let lineHeight = $state<number>(Number((browser ? localStorage.getItem('hm-ui-line-height') : null) ?? DEFAULT_LINE_HEIGHT));
	let activeAccent = $state<string>((browser ? localStorage.getItem('hm-accent') : null) ?? '');

	const CODE_THEMES = [
		{ id: 'github-dark', label: 'GitHub Dark', file: 'github-dark' },
		{ id: 'github-light', label: 'GitHub Light', file: 'github' },
		{ id: 'monokai-sublime', label: 'Monokai', file: 'monokai-sublime' },
		{ id: 'tokyo-night-dark', label: 'Tokyo Night', file: 'tokyo-night-dark' },
		{ id: 'dracula', label: 'Dracula', file: 'base16/dracula' },
	] as const;
	type CodeThemeId = typeof CODE_THEMES[number]['id'];
	let activeCodeTheme = $state<CodeThemeId>(
		((browser ? localStorage.getItem('hm-code-theme') : null) as CodeThemeId | null) ?? 'github-dark'
	);

	const FONT_OPTIONS: Record<string, string> = {
		system: '',
		monospace: "'JetBrains Mono', 'Fira Code', monospace",
		serif: "Georgia, 'Times New Roman', serif",
	};

	function applyBorderRadius(r: number) { document.documentElement.style.setProperty('--radius', r + 'px'); document.documentElement.style.setProperty('--radius-sm', Math.round(r / 2) + 'px'); }
	function applyFontFamily(key: string) { const val = FONT_OPTIONS[key] ?? ''; if (val) document.documentElement.style.setProperty('--font', val); else document.documentElement.style.removeProperty('--font'); }
	function applySidebarWidth(w: number) { document.documentElement.style.setProperty('--sidebar-width', w + 'px'); }
	function applyFontSize(size: number) { document.documentElement.style.setProperty('--font-size-base', size + 'px'); }
	function applyLineHeight(lh: number) { document.documentElement.style.setProperty('--line-height-base', String(lh)); }
	function applyAccent(color: string) { document.documentElement.style.setProperty('--accent', color); document.documentElement.style.setProperty('--accent-dim', `color-mix(in srgb, ${color} 15%, transparent)`); }

	function selectAccent(color: string) { activeAccent = color; hexInput = color; localStorage.setItem('hm-accent', color); applyAccent(color); }
	function resetAccent() { activeAccent = ''; hexInput = DEFAULT_ACCENT; localStorage.removeItem('hm-accent'); document.documentElement.style.removeProperty('--accent'); document.documentElement.style.removeProperty('--accent-dim'); }
	function resetAppearanceDefaults() { resetAccent(); borderRadius = DEFAULT_BORDER_RADIUS; localStorage.removeItem('hm-border-radius'); applyBorderRadius(DEFAULT_BORDER_RADIUS); fontFamily = 'system'; localStorage.removeItem('hm-font'); applyFontFamily('system'); sidebarWidth = DEFAULT_SIDEBAR_WIDTH; localStorage.removeItem('hm-sidebar-width'); applySidebarWidth(DEFAULT_SIDEBAR_WIDTH); }

	function applyCodeTheme(themeId: string) {
		const entry = CODE_THEMES.find(t => t.id === themeId);
		if (!entry) return;
		const href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${entry.file}.min.css`;
		let link = document.getElementById('hljs-theme') as HTMLLinkElement | null;
		if (!link) { link = document.createElement('link'); link.id = 'hljs-theme'; link.rel = 'stylesheet'; document.head.appendChild(link); }
		link.href = href;
	}
	function selectCodeTheme(themeId: CodeThemeId) { activeCodeTheme = themeId; localStorage.setItem('hm-code-theme', themeId); applyCodeTheme(themeId); }
	function onHexInputChange(e: Event) { const val = (e.currentTarget as HTMLInputElement).value; hexInput = val; if (/^#[0-9a-fA-F]{6}$/.test(val)) selectAccent(val); }

	// ── Project ───────────────────────────────────────────────────────────────
	let projectPath = $state(appState.projectPath || '');
	let projectSaved = $state(false);
	function saveProject() { const p = projectPath.trim(); setProject(p); projectSaved = true; setTimeout(() => { projectSaved = false; }, 2000); }
	async function browseProject() {
		const picked = await api.pickFolder();
		if (picked) { projectPath = picked; setProject(picked); projectSaved = true; setTimeout(() => { projectSaved = false; }, 2000); }
	}

	// ── Claude OAuth ──────────────────────────────────────────────────────────
	let oauthConnecting = $state(false);
	let oauthError = $state('');

	async function connectClaude() {
		oauthConnecting = true;
		oauthError = '';
		try {
			await api.startClaudeOAuth();
			providers = await api.listProviders();
			for (const p of providers) keys[p.id] = p.has_key ? '••••••••••••••••' : '';
			saved['anthropic'] = true;
			setTimeout(() => { saved['anthropic'] = false; }, 2000);
		} catch (e) {
			oauthError = String(e);
		} finally {
			oauthConnecting = false;
		}
	}

	// ── API Keys ──────────────────────────────────────────────────────────────
	function focusKey(id: string) { if (keys[id] === '••••••••••••••••') { keys[id] = ''; keyValid[id] = null; } }
	async function saveKey(id: string) {
		const key = keys[id].trim();
		if (key === '••••••••••••••••') return;
		saving[id] = true;
		try {
			await api.setApiKey(id, key);
			if (key) { keyDates[id] = Date.now(); localStorage.setItem('hm-key-dates', JSON.stringify(keyDates)); }
			else { delete keyDates[id]; localStorage.setItem('hm-key-dates', JSON.stringify(keyDates)); }
			saved[id] = true; keyValid[id] = null;
			providers = await api.listProviders();
			if (key) keys[id] = '••••••••••••••••';
			setTimeout(() => { saved[id] = false; }, 2000);
		} finally { saving[id] = false; }
	}

	// ── AI Parameters ─────────────────────────────────────────────────────────
	const MAX_TOKENS_OPTIONS: Array<{ label: string; value: number | null }> = [
		{ label: 'Model default', value: null },
		{ label: '1024', value: 1024 }, { label: '2048', value: 2048 },
		{ label: '4096', value: 4096 }, { label: '8192', value: 8192 },
		{ label: '16384', value: 16384 }, { label: '32768', value: 32768 },
	];

	// ── Prompts ───────────────────────────────────────────────────────────────
	interface StoredPrompt { id: string; name: string; content: string; }

	function loadPrompts(): StoredPrompt[] {
		try { return JSON.parse((browser ? localStorage.getItem('hm-prompts') : null) ?? '[]'); } catch { return []; }
	}
	function savePrompts(p: StoredPrompt[]) { localStorage.setItem('hm-prompts', JSON.stringify(p)); }

	let prompts = $state<StoredPrompt[]>(loadPrompts());
	let activePromptId = $state<string | null>((browser ? localStorage.getItem('hm-active-prompt') : null) ?? null);
	let editingPrompt = $state<StoredPrompt | null>(null);
	let newPromptName = $state('');
	let newPromptContent = $state('');

	function addPrompt() {
		if (!newPromptName.trim() || !newPromptContent.trim()) return;
		const p: StoredPrompt = { id: crypto.randomUUID(), name: newPromptName.trim(), content: newPromptContent.trim() };
		prompts = [...prompts, p];
		savePrompts(prompts);
		newPromptName = ''; newPromptContent = '';
	}
	function deletePrompt(id: string) {
		prompts = prompts.filter(p => p.id !== id);
		savePrompts(prompts);
		if (activePromptId === id) activatePrompt(null);
	}
	function activatePrompt(id: string | null) {
		activePromptId = id;
		if (id) localStorage.setItem('hm-active-prompt', id);
		else localStorage.removeItem('hm-active-prompt');
		const p = prompts.find(p => p.id === id);
		appState.globalSystemPrompt = p?.content ?? '';
		localStorage.setItem('hm-global-system-prompt', appState.globalSystemPrompt);
	}
	function startEditPrompt(p: StoredPrompt) { editingPrompt = { ...p }; }
	function saveEditPrompt() {
		if (!editingPrompt) return;
		prompts = prompts.map(p => p.id === editingPrompt!.id ? editingPrompt! : p);
		savePrompts(prompts);
		if (activePromptId === editingPrompt.id) activatePrompt(editingPrompt.id);
		editingPrompt = null;
	}

	// ── Preconfigs ────────────────────────────────────────────────────────────
	interface Preconfig { id: string; name: string; provider: string; model: string; temperature: number; systemPrompt: string; }

	const QUICK_MODELS = [
		{ provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
		{ provider: 'anthropic', model: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
		{ provider: 'anthropic', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
		{ provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
		{ provider: 'openai', model: 'gpt-4o-mini', label: 'GPT-4o mini' },
		{ provider: 'google', model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
		{ provider: 'google', model: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
		{ provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)' },
		{ provider: 'deepseek', model: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
	];

	function loadPreconfigs(): Preconfig[] {
		try { return JSON.parse((browser ? localStorage.getItem('hm-preconfigs') : null) ?? '[]'); } catch { return []; }
	}
	function savePreconfigs(c: Preconfig[]) { localStorage.setItem('hm-preconfigs', JSON.stringify(c)); }

	let preconfigs = $state<Preconfig[]>(loadPreconfigs());
	let newPc = $state<Omit<Preconfig, 'id'>>({ name: '', provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0.7, systemPrompt: '' });

	function addPreconfig() {
		if (!newPc.name.trim()) return;
		const pc: Preconfig = { id: crypto.randomUUID(), ...newPc, name: newPc.name.trim() };
		preconfigs = [...preconfigs, pc];
		savePreconfigs(preconfigs);
		newPc = { name: '', provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0.7, systemPrompt: '' };
	}
	function deletePreconfig(id: string) { preconfigs = preconfigs.filter(p => p.id !== id); savePreconfigs(preconfigs); }
	function applyPreconfig(pc: Preconfig) {
		appState.temperature = pc.temperature;
		appState.globalSystemPrompt = pc.systemPrompt;
		localStorage.setItem('hm-provider', pc.provider);
		localStorage.setItem('hm-model', pc.model);
		localStorage.setItem('hm-temperature', String(pc.temperature));
		localStorage.setItem('hm-global-system-prompt', pc.systemPrompt);
	}

	function onNewPcModelChange(e: Event) {
		const val = (e.currentTarget as HTMLSelectElement).value;
		const entry = QUICK_MODELS.find(m => m.model === val);
		if (entry) { newPc = { ...newPc, provider: entry.provider, model: entry.model }; }
	}

	// ── Security ──────────────────────────────────────────────────────────────
	let alwaysAllowed = $state<string[]>([]);

	async function loadAlwaysAllowed() {
		alwaysAllowed = await api.listAlwaysAllowed();
	}

	async function revokePermission(key: string) {
		await api.revokeToolPermission(key);
		alwaysAllowed = alwaysAllowed.filter(k => k !== key);
	}

	// ── Danger ────────────────────────────────────────────────────────────────
	function clearLocalStorage() {
		if (!confirm('Clear all hm- localStorage settings?')) return;
		for (const key of Object.keys(localStorage).filter(k => k.startsWith('hm-'))) localStorage.removeItem(key);
		location.reload();
	}

	// ── Mount ─────────────────────────────────────────────────────────────────
	onMount(async () => {
		initSettings();
		applyCodeTheme(activeCodeTheme);
		if (activeAccent) applyAccent(activeAccent);
		applyFontSize(fontSize); applyLineHeight(lineHeight);
		applyBorderRadius(borderRadius); applyFontFamily(fontFamily); applySidebarWidth(sidebarWidth);

		if (!appState.projectPath) {
			const stored = localStorage.getItem('hm-project');
			if (stored) { appState.projectPath = stored; projectPath = stored; }
		} else { projectPath = appState.projectPath; }

		providers = await api.listProviders();
		for (const p of providers) keys[p.id] = p.has_key ? '••••••••••••••••' : '';
		await loadAlwaysAllowed();
	});
</script>

<button class="backdrop" aria-label="Close settings" onclick={() => appState.settingsOpen = false}></button>

<div class="panel">
	<div class="panel-header">
		<span class="panel-title">Settings</span>
		<button class="close-btn" aria-label="Close settings" onclick={() => appState.settingsOpen = false}>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
				<path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
			</svg>
		</button>
	</div>

	<div class="tabs">
		{#each ([['appearance','Appearance'],['providers','Providers'],['ai','AI'],['prompts','Prompts'],['preconfigs','Preconfigs'],['security','Security']] as [Tab, string][]) as [id, label]}
			<button class="tab-btn" class:active={activeTab === id} onclick={() => { activeTab = id; if (id === 'security') loadAlwaysAllowed(); }}>{label}</button>
		{/each}
	</div>

	<div class="tab-body">

		<!-- ── APPEARANCE ── -->
		{#if activeTab === 'appearance'}
			<section class="section">
				<div class="section-title">Theme</div>
				<div class="btn-row">
					{#each (['light', 'dark', 'oxide'] as const) as t}
						<button class="seg-btn" class:active={appState.theme === t} onclick={() => setTheme(t)}>
							{t.charAt(0).toUpperCase() + t.slice(1)}
						</button>
					{/each}
				</div>
			</section>

			<section class="section">
				<div class="section-title">Code Theme</div>
				<div class="btn-row" style="flex-wrap: wrap;">
					{#each CODE_THEMES as t}
						<button class="seg-btn" class:active={activeCodeTheme === t.id} onclick={() => selectCodeTheme(t.id)}>{t.label}</button>
					{/each}
				</div>
			</section>

			<section class="section">
				<div class="section-title">Color Scheme</div>
				<div class="scheme-row">
					{#each COLOR_SCHEMES as s}
						<button
							class="scheme-swatch"
							class:active={activeScheme === s.id}
							style="background:{s.accent}"
							title={s.label}
							onclick={() => applyScheme(s.id)}
						>
							<span class="scheme-label">{s.label}</span>
							{#if activeScheme === s.id}
								<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{/if}
						</button>
					{/each}
				</div>
				{#if activeScheme}
					<button class="link-btn" onclick={clearScheme} style="margin-top:6px">Clear scheme</button>
				{/if}
			</section>

			<section class="section">
				<div class="section-title">Accent Color</div>
				<div class="swatch-row">
					{#each ACCENT_PRESETS as p}
						<button class="swatch" class:active={activeAccent === p.color} style="background:{p.color}" title={p.label}
							onclick={() => selectAccent(p.color)} aria-label={p.label}>
							{#if activeAccent === p.color}<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
						</button>
					{/each}
					<label class="swatch swatch-custom" title="Custom">
						<input type="color" value={activeAccent || DEFAULT_ACCENT} oninput={(e) => selectAccent((e.currentTarget as HTMLInputElement).value)} />
						<span style="font-size:14px;color:var(--text-muted);pointer-events:none">+</span>
					</label>
					<input class="hex-input" type="text" maxlength={7} value={hexInput} placeholder="#000000" oninput={onHexInputChange} />
				</div>
				<div style="display:flex;gap:10px;margin-top:8px">
					{#if activeAccent}<button class="link-btn" onclick={resetAccent}>Reset accent</button>{/if}
					<button class="link-btn" onclick={resetAppearanceDefaults}>Reset all</button>
				</div>
			</section>

			<section class="section">
				<div class="section-title">UI Scale</div>
				<div class="slider-row">
					<span class="slider-label">Font size</span>
					<input class="slider" type="range" min="12" max="18" step="1" value={fontSize}
						oninput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); fontSize = v; localStorage.setItem('hm-ui-font-size', String(v)); applyFontSize(v); }} />
					<span class="slider-val">{fontSize}px</span>
				</div>
				<div class="slider-row">
					<span class="slider-label">Line height</span>
					<input class="slider" type="range" min="1.3" max="2.0" step="0.1" value={lineHeight}
						oninput={(e) => { const v = Number(Number((e.currentTarget as HTMLInputElement).value).toFixed(1)); lineHeight = v; localStorage.setItem('hm-ui-line-height', String(v)); applyLineHeight(v); }} />
					<span class="slider-val">{lineHeight.toFixed(1)}×</span>
				</div>
			</section>

			<section class="section">
				<div class="section-title">Appearance</div>
				<div class="slider-row">
					<span class="slider-label">Corner radius</span>
					<input class="slider" type="range" min="0" max="16" step="2" value={borderRadius}
						oninput={(e) => { const r = Number((e.currentTarget as HTMLInputElement).value); borderRadius = r; localStorage.setItem('hm-border-radius', String(r)); applyBorderRadius(r); }} />
					<span class="slider-val">{borderRadius}px</span>
				</div>
				<div class="row-field">
					<span class="slider-label">Font family</span>
					<select class="field-select" value={fontFamily}
						onchange={(e) => { const k = (e.currentTarget as HTMLSelectElement).value; fontFamily = k; localStorage.setItem('hm-font', k); applyFontFamily(k); }}>
						<option value="system">System</option>
						<option value="monospace">Monospace</option>
						<option value="serif">Serif</option>
					</select>
				</div>
				<div class="slider-row">
					<span class="slider-label">Sidebar width</span>
					<input class="slider" type="range" min="180" max="420" step="10" value={sidebarWidth}
						oninput={(e) => { const w = Number((e.currentTarget as HTMLInputElement).value); sidebarWidth = w; localStorage.setItem('hm-sidebar-width', String(w)); applySidebarWidth(w); }} />
					<span class="slider-val">{sidebarWidth}px</span>
				</div>
			</section>
		{/if}

		<!-- ── PROVIDERS ── -->
		{#if activeTab === 'providers'}
			<section class="section">
				<div class="section-title">Project</div>
				<div style="display:flex;gap:6px">
					<input class="field-input" type="text" placeholder="/Users/you/my-project" bind:value={projectPath}
						onkeydown={(e) => { if (e.key === 'Enter') saveProject(); }} />
					<button class="save-btn" onclick={browseProject}>Browse…</button>
					<button class="save-btn" class:saved={projectSaved} onclick={saveProject} disabled={!projectPath.trim()}>
						{#if projectSaved}✓{:else}Set{/if}
					</button>
				</div>
				{#if projectPath}
					<div class="hint">Working directory: <strong style="color:var(--text-secondary)">{projectPath.split('/').pop()}</strong></div>
				{:else}
					<div class="hint">Used as working directory for tools</div>
				{/if}
				{#if getRecentProjects().filter(p => p !== projectPath).length > 0}
					<div class="hint" style="margin-top:6px">Recent:</div>
					<div class="recent-list">
						{#each getRecentProjects().filter(p => p !== projectPath).slice(0, 5) as p}
							<button class="recent-item" onclick={() => { projectPath = p; setProject(p); projectSaved = true; setTimeout(() => { projectSaved = false; }, 1500); }}>
								{p.split('/').pop()}
								<span class="recent-path">{p}</span>
							</button>
						{/each}
					</div>
				{/if}
			</section>

			<section class="section">
				<div class="section-title">API Keys</div>
				<div class="providers-list">
					{#each providers as p (p.id)}
						<div class="provider-row">
							<div class="provider-meta">
								<span class="provider-label">{p.label}</span>
								{#if p.has_key && keyValid[p.id] === null}
									<span class="badge badge-green">Connected</span>
								{/if}
								{#if keyValid[p.id] === true}
									<span class="badge badge-green">Valid format</span>
								{:else if keyValid[p.id] === false}
									<span class="badge badge-red">Invalid format</span>
								{:else if !p.has_key && p.id !== 'ollama'}
									<span class="badge badge-muted">Not set</span>
								{/if}
								{#if (keyAgeDays(p.id) ?? 0) >= 90}
									<span class="badge badge-amber">Rotate</span>
								{/if}
							</div>
							<div style="display:flex;gap:6px">
								<input class="field-input" type={keyVisible[p.id] ? 'text' : 'password'}
									placeholder={p.id === 'ollama' ? 'http://localhost:11434' : 'sk-…'}
									value={keys[p.id] ?? ''}
									onfocus={() => { if (keys[p.id] === '••••••••••••••••') { keys[p.id] = ''; keyValid[p.id] = null; } }}
									oninput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; keys[p.id] = v; keyValid[p.id] = p.id === 'ollama' ? null : validateKeyFormat(p.id, v); }}
									onkeydown={(e) => { if (e.key === 'Enter') saveKey(p.id); }} />
								{#if p.has_key && keys[p.id] === '••••••••••••••••' && p.id !== 'ollama'}
									<button class="icon-btn" onclick={() => { keyVisible[p.id] = !keyVisible[p.id]; }}>{keyVisible[p.id] ? '🙈' : '👁'}</button>
								{/if}
								<button class="save-btn" class:saved={saved[p.id]}
									disabled={saving[p.id] || !keys[p.id]?.trim() || keys[p.id] === '••••••••••••••••'}
									onclick={() => saveKey(p.id)}>
									{#if saving[p.id]}…{:else if saved[p.id]}✓{:else}Save{/if}
								</button>
							</div>
							{#if p.id === 'anthropic'}
								<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
									<button class="oauth-btn" onclick={connectClaude} disabled={oauthConnecting}>
										{#if oauthConnecting}Connecting…{:else if saved['anthropic']}Connected ✓{:else}Connect with Claude.ai{/if}
									</button>
									<span class="hint" style="margin:0">— or paste an API key above</span>
								</div>
								{#if oauthError}<div class="hint" style="color:var(--red);margin-top:4px">{oauthError}</div>{/if}
							{:else if p.id === 'ollama'}
								<div class="hint">URL where Ollama is running. Default: http://localhost:11434</div>
							{:else if keyAgeLabel(p.id)}
								<div class="hint">{keyAgeLabel(p.id)}</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<section class="section">
				<div class="section-title">MCP Servers</div>
				<div style="display:flex;align-items:center;justify-content:space-between">
					<span class="hint" style="font-size:12px;color:var(--text-secondary)">Configure external tool servers</span>
					<button class="save-btn" disabled>Configure</button>
				</div>
			</section>

			<section class="section">
				<div class="section-title danger-title">Danger Zone</div>
				<button class="danger-btn" onclick={clearLocalStorage}>Clear all localStorage settings</button>
			</section>
		{/if}

		<!-- ── AI ── -->
		{#if activeTab === 'ai'}
			<section class="section">
				<div class="section-title">Parameters</div>
				<div class="slider-row">
					<span class="slider-label">Temperature</span>
					<input class="slider" type="range" min="0" max="1" step="0.05" value={appState.temperature}
						oninput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); appState.temperature = v; localStorage.setItem('hm-temperature', String(v)); }} />
					<span class="slider-val">{appState.temperature.toFixed(2)}</span>
				</div>
				<div class="row-field">
					<span class="slider-label">Max tokens</span>
					<select class="field-select" value={appState.maxTokens === null ? 'null' : String(appState.maxTokens)}
						onchange={(e) => { const raw = (e.currentTarget as HTMLSelectElement).value; const v = raw === 'null' ? null : Number(raw); appState.maxTokens = v; if (v === null) localStorage.removeItem('hm-max-tokens'); else localStorage.setItem('hm-max-tokens', String(v)); }}>
						{#each MAX_TOKENS_OPTIONS as opt}
							<option value={opt.value === null ? 'null' : String(opt.value)}>{opt.label}</option>
						{/each}
					</select>
				</div>
				<label class="check-label">
					<input type="checkbox" checked={appState.streamResponse}
						onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).checked; appState.streamResponse = v; localStorage.setItem('hm-stream', String(v)); }} />
					<span>Stream responses in real-time</span>
				</label>
			</section>

			<section class="section">
				<div class="section-title">Global System Prompt</div>
				<textarea class="prompt-textarea" rows={5}
					placeholder="e.g. Always respond in a formal tone."
					value={appState.globalSystemPrompt}
					oninput={(e) => { const v = (e.currentTarget as HTMLTextAreaElement).value; appState.globalSystemPrompt = v; localStorage.setItem('hm-global-system-prompt', v); activePromptId = null; localStorage.removeItem('hm-active-prompt'); }}
				></textarea>
				{#if activePromptId}
					<div class="hint" style="margin-top:4px">Using prompt: <strong>{prompts.find(p=>p.id===activePromptId)?.name}</strong></div>
				{/if}
			</section>
		{/if}

		<!-- ── PROMPTS ── -->
		{#if activeTab === 'prompts'}
			<section class="section">
				<div class="section-title">Saved Prompts</div>
				{#if prompts.length === 0}
					<p class="empty-msg">No prompts yet. Add one below.</p>
				{:else}
					<div class="prompt-list">
						{#each prompts as p}
							{#if editingPrompt?.id === p.id}
								<div class="prompt-card editing">
									<input class="field-input" bind:value={editingPrompt.name} placeholder="Name" />
									<textarea class="prompt-textarea" rows={3} bind:value={editingPrompt.content}></textarea>
									<div style="display:flex;gap:6px;margin-top:6px">
										<button class="save-btn" onclick={saveEditPrompt}>Save</button>
										<button class="link-btn" onclick={() => { editingPrompt = null; }}>Cancel</button>
									</div>
								</div>
							{:else}
								<div class="prompt-card" class:active-prompt={activePromptId === p.id}>
									<div class="prompt-card-header">
										<span class="prompt-name">{p.name}</span>
										<div style="display:flex;gap:6px">
											<button class="seg-btn" class:active={activePromptId === p.id}
												onclick={() => activatePrompt(activePromptId === p.id ? null : p.id)}>
												{activePromptId === p.id ? 'Active' : 'Use'}
											</button>
											<button class="icon-btn" onclick={() => startEditPrompt(p)}>Edit</button>
											<button class="icon-btn danger" onclick={() => deletePrompt(p.id)}>×</button>
										</div>
									</div>
									<p class="prompt-preview">{p.content.substring(0, 100)}{p.content.length > 100 ? '…' : ''}</p>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</section>

			<section class="section">
				<div class="section-title">Add Prompt</div>
				<div style="display:flex;flex-direction:column;gap:8px">
					<input class="field-input" bind:value={newPromptName} placeholder="Name (e.g. Concise assistant)" />
					<textarea class="prompt-textarea" rows={4} bind:value={newPromptContent} placeholder="System prompt content…"></textarea>
					<button class="save-btn" onclick={addPrompt} disabled={!newPromptName.trim() || !newPromptContent.trim()} style="align-self:flex-end">Add Prompt</button>
				</div>
			</section>
		{/if}

		<!-- ── PRECONFIGS ── -->
		{#if activeTab === 'preconfigs'}
			<section class="section">
				<div class="section-title">Saved Preconfigs</div>
				{#if preconfigs.length === 0}
					<p class="empty-msg">No preconfigs yet. A preconfig bundles a model + temperature + system prompt so you can switch contexts instantly.</p>
				{:else}
					<div class="prompt-list">
						{#each preconfigs as pc}
							<div class="prompt-card">
								<div class="prompt-card-header">
									<div>
										<span class="prompt-name">{pc.name}</span>
										<span class="hint" style="margin-left:8px">{QUICK_MODELS.find(m=>m.model===pc.model)?.label ?? pc.model} · {pc.temperature.toFixed(2)}</span>
									</div>
									<div style="display:flex;gap:6px">
										<button class="seg-btn" onclick={() => applyPreconfig(pc)}>Apply</button>
										<button class="icon-btn danger" onclick={() => deletePreconfig(pc.id)}>×</button>
									</div>
								</div>
								{#if pc.systemPrompt}
									<p class="prompt-preview">{pc.systemPrompt.substring(0, 80)}{pc.systemPrompt.length > 80 ? '…' : ''}</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<section class="section">
				<div class="section-title">New Preconfig</div>
				<div style="display:flex;flex-direction:column;gap:8px">
					<input class="field-input" bind:value={newPc.name} placeholder="Name (e.g. Fast coder)" />
					<select class="field-select" value={newPc.model} onchange={onNewPcModelChange}>
						{#each QUICK_MODELS as m}
							<option value={m.model}>{m.label}</option>
						{/each}
					</select>
					<div class="slider-row" style="margin-bottom:0">
						<span class="slider-label">Temperature</span>
						<input class="slider" type="range" min="0" max="1" step="0.05" value={newPc.temperature}
							oninput={(e) => { newPc = { ...newPc, temperature: Number((e.currentTarget as HTMLInputElement).value) }; }} />
						<span class="slider-val">{newPc.temperature.toFixed(2)}</span>
					</div>
					<textarea class="prompt-textarea" rows={3} bind:value={newPc.systemPrompt} placeholder="System prompt (optional)…"></textarea>
					<button class="save-btn" onclick={addPreconfig} disabled={!newPc.name.trim()} style="align-self:flex-end">Add Preconfig</button>
				</div>
			</section>
		{/if}


	{#if activeTab === 'security'}
		<section class="section">
			<div class="section-title">Always-allowed tools</div>
			{#if alwaysAllowed.length === 0}
				<div class="empty-hint">No tools permanently allowed yet. Use "Always" in a tool approval prompt to add one.</div>
			{:else}
				<div class="perm-list">
					{#each alwaysAllowed as key (key)}
						<div class="perm-row">
							<span class="perm-key">{key}</span>
							<button class="perm-revoke" onclick={() => revokePermission(key)}>Revoke</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	</div>

	<div class="panel-footer">hashmark v0.1.0</div>
</div>

<style>
.backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.3); }

.panel {
	position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
	z-index: 201; width: 500px; max-height: 82vh;
	background: var(--bg-panel); border: 1px solid var(--border-mid);
	border-radius: var(--radius-lg); box-shadow: var(--shadow-overlay);
	display: flex; flex-direction: column; overflow: hidden;
	animation: fade-in 120ms ease;
}

.panel-header {
	display: flex; align-items: center; justify-content: space-between;
	padding: 14px 16px 12px; border-bottom: 1px solid var(--border);
	flex-shrink: 0; background: var(--bg-panel);
}
.panel-title { font-size: 13px; font-weight: 600; color: var(--text); }
.close-btn { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); color: var(--text-tertiary); transition: background var(--transition), color var(--transition); }
.close-btn:hover { background: var(--bg-hover); color: var(--text); }

.tabs { display: flex; gap: 2px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; background: var(--bg-panel); }
.tab-btn { padding: 5px 12px; border-radius: var(--radius-sm); font-size: 12px; color: var(--text-muted); transition: background var(--transition), color var(--transition); }
.tab-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.tab-btn.active { background: var(--accent-dim); color: var(--accent); }

.tab-body { flex: 1; overflow-y: auto; scrollbar-width: thin; }

.section { padding: 14px 16px; border-bottom: 1px solid var(--border); }
.section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 10px; }

.btn-row { display: flex; gap: 6px; }
.seg-btn { padding: 5px 12px; border-radius: var(--radius-sm); border: 1px solid var(--stroke-secondary); font-size: 12px; color: var(--text-tertiary); transition: background var(--transition), border-color var(--transition), color var(--transition); }
.seg-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.seg-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.swatch-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.swatch { width: 24px; height: 24px; border-radius: var(--radius-full); border: 2px solid transparent; outline: 2px solid transparent; outline-offset: 2px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: outline-color var(--transition); }
.swatch:hover { outline-color: var(--stroke-primary); }
.swatch.active { outline-color: var(--text); }
.swatch-custom { border: 2px dashed var(--stroke-secondary); cursor: pointer; position: relative; overflow: hidden; }
.swatch-custom input[type="color"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.hex-input { width: 72px; background: var(--bg-elevated); border: 1px solid var(--stroke-secondary); border-radius: var(--radius-sm); padding: 3px 7px; font-size: 11px; color: var(--text); font-family: "JetBrains Mono", monospace; outline: none; }
.hex-input:focus { border-color: var(--stroke-primary); }

.slider-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.slider-label { font-size: 12px; color: var(--text-secondary); flex-shrink: 0; width: 96px; }
.slider { flex: 1; accent-color: var(--accent); cursor: pointer; height: 4px; }
.slider-val { font-size: 11px; color: var(--text-muted); min-width: 36px; text-align: right; font-family: "JetBrains Mono", monospace; }

.row-field { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.field-select { flex: 1; background: var(--bg-elevated); border: 1px solid var(--stroke-secondary); border-radius: var(--radius-sm); padding: 4px 8px; font-size: 12px; color: var(--text); outline: none; cursor: pointer; }
.field-select:focus { border-color: var(--stroke-primary); }
.field-input { flex: 1; background: var(--bg-elevated); border: 1px solid var(--stroke-secondary); border-radius: var(--radius-sm); padding: 5px 9px; font-size: 12px; color: var(--text); outline: none; font-family: "JetBrains Mono", monospace; }
.field-input:focus { border-color: var(--stroke-primary); }
.field-input:disabled { opacity: 0.4; cursor: not-allowed; }

.link-btn { font-size: 11px; color: var(--text-muted); text-decoration: underline; text-underline-offset: 2px; }
.link-btn:hover { color: var(--text-secondary); }

.hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

.save-btn { padding: 5px 12px; border-radius: var(--radius-sm); border: 1px solid var(--stroke-secondary); font-size: 12px; color: var(--text-secondary); min-width: 52px; transition: background var(--transition), color var(--transition), border-color var(--transition); }
.save-btn:not(:disabled):hover { background: var(--accent); border-color: var(--accent); color: #fff; }
.save-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.save-btn.saved { background: color-mix(in srgb, var(--green) 15%, transparent); border-color: var(--green); color: var(--green); }

.icon-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-sm); border: 1px solid var(--stroke-secondary); color: var(--text-muted); font-size: 12px; flex-shrink: 0; transition: background var(--transition), color var(--transition); }
.icon-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.icon-btn.danger:hover { background: rgba(239,68,68,0.1); color: #ef4444; border-color: rgba(239,68,68,0.4); }

.check-label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); cursor: pointer; margin-top: 8px; }
.check-label input { accent-color: var(--accent); cursor: pointer; }

.prompt-textarea { width: 100%; background: var(--bg-elevated); border: 1px solid var(--stroke-secondary); border-radius: var(--radius-sm); padding: 6px 9px; font-size: 12px; color: var(--text); outline: none; resize: vertical; font-family: inherit; line-height: 1.5; box-sizing: border-box; }
.prompt-textarea:focus { border-color: var(--stroke-primary); }

.providers-list { display: flex; flex-direction: column; gap: 10px; }
.provider-row { display: flex; flex-direction: column; gap: 5px; }
.provider-meta { display: flex; align-items: center; gap: 8px; }
.provider-label { font-size: 12px; color: var(--text-secondary); }
.badge { font-size: 10px; padding: 1px 6px; border-radius: var(--radius-full); font-weight: 500; }
.badge-green { background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 30%, transparent); }
.badge-red { background: color-mix(in srgb, var(--red) 15%, transparent); color: var(--red); border: 1px solid color-mix(in srgb, var(--red) 30%, transparent); }
.badge-amber { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #f59e0b; border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent); }
.badge-muted { background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--stroke-secondary); }

.empty-msg { font-size: 12px; color: var(--text-muted); line-height: 1.6; }

.prompt-list { display: flex; flex-direction: column; gap: 8px; }
.prompt-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; }
.prompt-card.active-prompt { border-color: var(--accent); background: var(--accent-dim); }
.prompt-card.editing { border-color: var(--stroke-primary); }
.prompt-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.prompt-name { font-size: 12px; font-weight: 600; color: var(--text); }
.prompt-preview { font-size: 11px; color: var(--text-muted); line-height: 1.5; white-space: pre-wrap; margin: 0; }

.recent-list { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.recent-item { display: flex; flex-direction: column; align-items: flex-start; padding: 5px 8px; border-radius: var(--radius-sm); text-align: left; font-size: 12px; color: var(--text-secondary); background: none; transition: background var(--transition); }
.recent-item:hover { background: var(--bg-hover); color: var(--text); }
.recent-path { font-size: 10px; color: var(--text-muted); font-family: "JetBrains Mono", monospace; margin-top: 1px; }
.oauth-btn { padding: 5px 12px; border-radius: var(--radius-sm); border: 1px solid var(--accent); font-size: 12px; color: var(--accent); background: var(--accent-dim); transition: background var(--transition), color var(--transition); }
.oauth-btn:not(:disabled):hover { background: var(--accent); color: #fff; }
.oauth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.danger-title { color: #ef4444; }
.danger-btn { padding: 5px 12px; border-radius: var(--radius-sm); border: 1px solid rgba(239,68,68,0.4); font-size: 12px; color: #ef4444; transition: background var(--transition), border-color var(--transition); }
.danger-btn:hover { background: rgba(239,68,68,0.1); border-color: #ef4444; }

.panel-footer { padding: 10px 16px; font-size: 11px; color: var(--text-muted); flex-shrink: 0; border-top: 1px solid var(--border); }

@keyframes fade-in { from { opacity: 0; transform: translate(-50%,-48%); } to { opacity: 1; transform: translate(-50%,-50%); } }

.scheme-row { display: flex; gap: 6px; flex-wrap: wrap; }
.scheme-swatch {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 3px;
	width: 60px;
	height: 44px;
	border-radius: var(--radius-sm, 4px);
	border: 2px solid transparent;
	cursor: pointer;
	font-size: 10px;
	transition: border-color 0.1s;
}
.scheme-swatch.active { border-color: #fff; }
.scheme-swatch:hover { opacity: 0.9; }
.scheme-label { color: #fff; font-size: 9px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }

.empty-hint { font-size: 12px; color: var(--text-muted); padding: 8px 0; }
.perm-list { display: flex; flex-direction: column; gap: 4px; }
.perm-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--bg-overlay, rgba(255,255,255,0.04)); border-radius: var(--radius-sm, 4px); }
.perm-key { flex: 1; font-size: 12px; font-family: var(--font-mono, monospace); color: var(--text); }
.perm-revoke { padding: 2px 8px; font-size: 11px; border-radius: var(--radius-sm, 4px); border: 1px solid var(--red, #e05252); color: var(--red, #e05252); background: none; cursor: pointer; }
.perm-revoke:hover { background: rgba(224,82,82,0.1); }
</style>
