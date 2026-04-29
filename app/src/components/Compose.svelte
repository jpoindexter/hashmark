<script lang="ts">
	import { appState } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { onMount, onDestroy, tick } from 'svelte';
	import { togglePopover } from '$lib/popovers.svelte';

	let input = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let unlisten: (() => void) | null = null;
	let modelPickerOpen = $state(false);
	let ollamaModels = $state<string[]>([]);
	let ollamaLoading = $state(false);
	let pastedImage = $state<{ dataUrl: string; mimeType: string } | null>(null);

	type GitInfo = { branch: string; dirty: boolean };
	let gitInfo = $state<GitInfo | null>(null);

	let agentPickerOpen = $state(false);

	type ComposePill = { name: string; path: string; content?: string };
	let composePills = $state<ComposePill[]>([]);

	function removePill(i: number) {
		composePills = composePills.filter((_, idx) => idx !== i);
	}

	let stopElapsed = $state(0);
	let stopElapsedTimer: ReturnType<typeof setInterval> | null = null;
	let stopStreamStart = $state<number | null>(null);

	$effect(() => {
		if (appState.streaming) {
			stopStreamStart = Date.now();
			stopElapsed = 0;
			stopElapsedTimer = setInterval(() => {
				stopElapsed = Math.floor((Date.now() - (stopStreamStart ?? Date.now())) / 1000);
			}, 1000);
		} else {
			if (stopElapsedTimer) { clearInterval(stopElapsedTimer); stopElapsedTimer = null; }
			stopStreamStart = null;
			stopElapsed = 0;
		}
		return () => {
			if (stopElapsedTimer) { clearInterval(stopElapsedTimer); stopElapsedTimer = null; }
		};
	});

	function fmtStopElapsed(s: number): string {
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}


	type PasteType = 'code' | 'json' | 'stacktrace' | 'url' | 'markdown' | 'plain';
	function guessLanguage(text: string): string {
		if (/import\s+.*\s+from\s+['"]/.test(text) || /=>\s*[{(]/.test(text) || /const\s+\w+\s*[:=]/.test(text)) return 'typescript';
		if (/\bdef\s+\w+/.test(text) || /^\s*import\s+\w+\s*$/m.test(text) || /:\s*$\n\s+/m.test(text)) return 'python';
		if (/\bfn\s+\w+/.test(text) || /let\s+mut\s+/.test(text)) return 'rust';
		if (/\bfunc\s+\w+/.test(text)) return 'go';
		return 'text';
	}

	function detectPasteType(text: string): PasteType {
		const trimmed = text.trim();
		if (/^https?:\/\/\S+$/.test(trimmed)) return 'url';
		try { JSON.parse(trimmed); return 'json'; } catch {}
		if (/(?:^|\n)\s*at\s+/.test(text) || /\bError:\s/.test(text) || /\bTraceback\b/.test(text)) return 'stacktrace';
		if (/^#{1,6}\s/m.test(text) || /\*\*\w/.test(text) || /^- \w/m.test(text) || /^\d+\.\s/m.test(text)) return 'markdown';
		const codeSignals = ['{', '}', 'function ', 'const ', 'import ', 'class ', 'def ', 'fn '].filter(s => text.includes(s));
		if (codeSignals.length >= 2) return 'code';
		return 'plain';
	}

	const TEXT_EXTENSIONS = [
		'.ts', '.tsx', '.js', '.jsx', '.svelte', '.rs', '.py', '.go',
		'.md', '.json', '.toml', '.yaml', '.yml', '.html', '.css', '.sh',
	];

	function getExt(name: string): string {
		const i = name.lastIndexOf('.');
		return i >= 0 ? name.slice(i).toLowerCase() : '';
	}

	const MAX_HISTORY = 50;
	let sentHistory = $state<string[]>([]);
	let historyIndex = $state(-1);

	function historyKey(sessionId: string) {
		return `hm-history-${sessionId}`;
	}
	function draftKey(sessionId: string) {
		return `hm-draft-${sessionId}`;
	}

	let draftTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const sid = appState.activeSessionId;
		if (!sid) return;
		try {
			const raw = localStorage.getItem(historyKey(sid));
			sentHistory = raw ? (JSON.parse(raw) as string[]) : [];
		} catch {
			sentHistory = [];
		}
		historyIndex = -1;
		try {
			const draft = localStorage.getItem(draftKey(sid));
			input = draft ?? '';
		} catch {
			input = '';
		}
	});

	const PROVIDERS: { id: string; label: string; models: { id: string; label: string }[] }[] = [
		{
			id: 'anthropic',
			label: 'Anthropic',
			models: [
				{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
				{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
				{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
			],
		},
		{
			id: 'openai',
			label: 'OpenAI',
			models: [
				{ id: 'gpt-4o', label: 'GPT-4o' },
				{ id: 'gpt-4o-mini', label: 'GPT-4o mini' },
				{ id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
			],
		},
		{
			id: 'google',
			label: 'Google Gemini',
			models: [
				{ id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
				{ id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
				{ id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
			],
		},
		{
			id: 'mistral',
			label: 'Mistral',
			models: [
				{ id: 'mistral-large-latest', label: 'Mistral Large' },
				{ id: 'mistral-small-latest', label: 'Mistral Small' },
			],
		},
		{
			id: 'groq',
			label: 'Groq',
			models: [
				{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
				{ id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
				{ id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
			],
		},
		{
			id: 'deepseek',
			label: 'DeepSeek',
			models: [
				{ id: 'deepseek-chat', label: 'DeepSeek Chat' },
				{ id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
			],
		},
		{
			id: 'openrouter',
			label: 'OpenRouter',
			models: [{ id: 'openrouter/auto', label: 'Auto' }],
		},
		{
			id: 'xai',
			label: 'xAI Grok',
			models: [
				{ id: 'grok-3', label: 'Grok 3' },
				{ id: 'grok-3-mini', label: 'Grok 3 Mini' },
			],
		},
		{
			id: 'ollama',
			label: 'Ollama (local)',
			models: [
				{ id: 'llama3.2', label: 'Llama 3.2' },
				{ id: 'llama3.1', label: 'Llama 3.1' },
				{ id: 'qwen2.5-coder', label: 'Qwen 2.5 Coder' },
			],
		},
	];

	const DEFAULT_PROVIDER = 'anthropic';
	const DEFAULT_MODEL = 'claude-sonnet-4-6';

	let selectedProvider = $state(DEFAULT_PROVIDER);
	let selectedModel = $state(DEFAULT_MODEL);

	$effect(() => {
		if (appState.activeSessionId) {
			const session = appState.sessions.find((s) => s.id === appState.activeSessionId);
			if (session) {
				selectedProvider = session.provider ?? DEFAULT_PROVIDER;
				selectedModel = session.model ?? DEFAULT_MODEL;
			}
		} else {
			selectedProvider = DEFAULT_PROVIDER;
			selectedModel = DEFAULT_MODEL;
		}
	});

	let modelLabel = $derived(() => {
		for (const p of PROVIDERS) {
			for (const m of p.models) {
				if (m.id === selectedModel) {
					const providerShort = p.id === 'anthropic' ? 'Claude' : p.label.split(' ')[0];
					const modelShort = m.label.replace(/^(Claude|GPT|Gemini|Grok|Mistral|Llama|Mixtral|DeepSeek)\s*/i, '');
					return `${providerShort} · ${modelShort}`;
				}
			}
		}
		return selectedModel;
	});

	async function openModelPicker() {
		modelPickerOpen = true;
		if (ollamaModels.length === 0) {
			ollamaLoading = true;
			try { ollamaModels = await api.listOllamaModels(); } catch { ollamaModels = []; }
			ollamaLoading = false;
		}
	}

	async function selectModel(providerId: string, modelId: string) {
		selectedProvider = providerId;
		selectedModel = modelId;
		modelPickerOpen = false;
		if (appState.activeSessionId) {
			await api.updateSession(appState.activeSessionId, { model: modelId, provider: providerId });
			appState.sessions = appState.sessions.map((s) =>
				s.id === appState.activeSessionId ? { ...s, model: modelId, provider: providerId } : s
			);
		}
	}

	onMount(async () => {
		unlisten = await listen<string>('ai-chunk', (e) => {
			appState.streamingContent += e.payload;
		});
		try {
			gitInfo = await invoke<GitInfo>('get_git_info', { path: appState.projectPath ?? '' });
		} catch { /* not a git repo or command unavailable */ }
	});


	onDestroy(() => {
		unlisten?.();
	});

	function saveDraft(val: string) {
		if (draftTimer) clearTimeout(draftTimer);
		draftTimer = setTimeout(() => {
			const sid = appState.activeSessionId;
			if (!sid) return;
			try { localStorage.setItem(draftKey(sid), val); } catch {}
		}, 500);
	}

	function autoResize() {
		if (!textareaEl) return;
		textareaEl.style.height = 'auto';
		textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
	}

	function processImageFile(file: File): Promise<void> {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => {
				pastedImage = {
					dataUrl: reader.result as string,
					mimeType: file.type,
				};
				resolve();
			};
			reader.readAsDataURL(file);
		});
	}

	function onPaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				e.preventDefault();
				const file = item.getAsFile();
				if (file) processImageFile(file);
				return;
			}
		}
		const text = e.clipboardData?.getData('text') ?? '';
		if (!text) return;
		const pasteType = detectPasteType(text);
		if (pasteType === 'url') return;
		if (pasteType === 'markdown' || pasteType === 'plain') return;

		e.preventDefault();
		const el = textareaEl;
		const cursorPos = el?.selectionStart ?? input.length;
		const cursorEnd = el?.selectionEnd ?? cursorPos;
		let wrapped: string;

		if (pasteType === 'json') {
			try { wrapped = '```json\n' + JSON.stringify(JSON.parse(text), null, 2) + '\n```'; }
			catch { wrapped = '```json\n' + text + '\n```'; }
		} else if (pasteType === 'stacktrace') {
			wrapped = '```text\n' + text + '\n```';
		} else {
			const lang = guessLanguage(text);
			wrapped = '```' + lang + '\n' + text + '\n```';
		}

		const insertEnd = cursorPos + wrapped.length;
		input = input.slice(0, cursorPos) + wrapped + input.slice(cursorEnd);

		tick().then(() => {
			if (el) {
				el.setSelectionRange(insertEnd, insertEnd);
				el.focus();
			}
			autoResize();
		});
	}



	function onDrop(e: DragEvent) {
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;
		const first = files[0];
		if (first.type.startsWith('image/')) {
			processImageFile(first);
		}
	}

	async function send() {
		const text = input.trim();
		if ((!text && !pastedImage) || appState.streaming) return;

		if (!appState.activeSessionId) {
			const session = await api.createSession({
				title: text.slice(0, 60) || 'New session',
				model: selectedModel,
				provider: selectedProvider,
				project_path: appState.projectPath || undefined,
			});
			appState.sessions = [session, ...appState.sessions];
			appState.activeSessionId = session.id;
		}

		if (pendingAgentId) {
			window.dispatchEvent(new CustomEvent('hm-apply-agent', { detail: { agentId: pendingAgentId } }));
			pendingAgentId = null;
		}

		let finalText = text;

		if (composePills.length > 0) {
			const pillText = composePills
				.filter(p => p.content)
				.map(p => {
					const lang = p.path.split('.').pop() ?? '';
					return `@${p.path}\n\`\`\`${lang}\n${p.content}\n\`\`\``;
				})
				.join('\n\n');
			if (pillText) finalText = pillText + '\n\n' + finalText;
		}

		let content: string;
		const allImages = pastedImage
			? [{ data: pastedImage.dataUrl.replace(/^data:[^;]+;base64,/, ''), mimeType: pastedImage.mimeType }]
			: [];

		if (allImages.length > 0) {
			content = JSON.stringify({ text: finalText, images: allImages });
		} else {
			content = finalText;
		}

		if (text) {
			const next = [...sentHistory, text].slice(-MAX_HISTORY);
			sentHistory = next;
			const sid = appState.activeSessionId!;
			try { localStorage.setItem(historyKey(sid), JSON.stringify(next)); } catch {}
			try { localStorage.removeItem(draftKey(sid)); } catch {}
		}
		historyIndex = -1;

		const userMsg = {
			id: crypto.randomUUID(),
			session_id: appState.activeSessionId!,
			role: 'user' as const,
			content,
			tool_name: null,
			tool_input: null,
			created_at: Date.now() / 1000,
		};
		appState.messages = [...appState.messages, userMsg];

		const activeSession = appState.sessions.find(s => s.id === appState.activeSessionId);
		if (activeSession?.agent_id) {
			window.dispatchEvent(new CustomEvent('agent-message-sent', { detail: { agentId: activeSession.agent_id, sessionId: activeSession.id } }));
		}

		input = '';
		pastedImage = null;
		composePills = [];
		if (textareaEl) textareaEl.style.height = 'auto';

		appState.streaming = true;
		appState.streamingContent = '';

		try {
			const response = await invoke<string>('stream_message', {
				sessionId: appState.activeSessionId,
				content,
			});

			appState.messages = [
				...appState.messages,
				{
					id: crypto.randomUUID(),
					session_id: appState.activeSessionId!,
					role: 'assistant' as const,
					content: appState.streamingContent || response,
					tool_name: null,
					tool_input: null,
					created_at: Date.now() / 1000,
				},
			];
		} catch (err) {
			appState.messages = [
				...appState.messages,
				{
					id: crypto.randomUUID(),
					session_id: appState.activeSessionId!,
					role: 'assistant' as const,
					content: `Error: ${err}`,
					tool_name: null,
					tool_input: null,
					created_at: Date.now() / 1000,
				},
			];
		} finally {
			appState.streaming = false;
			appState.streamingContent = '';
		}
	}

	$effect(() => {
		if (appState.fileInsert) {
			input += (input ? ' ' : '') + appState.fileInsert;
			appState.fileInsert = '';
		}
	});

	let projectName = $derived(
		appState.projectPath
			? appState.projectPath.replace(/\/$/, '').split('/').at(-1) ?? 'Local'
			: 'Local'
	);

	let canSend = $derived(
		(input.trim().length > 0 || pastedImage !== null) && !appState.streaming
	);

	let mentionActive = $state(false);
	let mentionQuery = $state('');
	let mentionIndex = $state(0);
	let pendingAgentId = $state<string | null>(null);

	type FilePickerEntry = { name: string; path: string; isDir: boolean; ext: string };
	let filePickerOpen = $state(false);
	let filePickerQuery = $state('');
	let filePickerIndex = $state(0);
	let filePickerResults = $state<FilePickerEntry[]>([]);
	let filePickerLoading = $state(false);
	let filePickerTriggerStart = $state(0);

	function getRecentFiles(): FilePickerEntry[] {
		try {
			const raw = localStorage.getItem('hm-recent-files');
			const parsed = raw ? (JSON.parse(raw) as { name: string; path: string }[]) : [];
			return parsed.slice(0, 5).map(f => ({
				name: f.name,
				path: f.path,
				isDir: false,
				ext: getExt(f.name),
			}));
		} catch { return []; }
	}

	function fileIcon(ext: string, isDir: boolean): string {
		if (isDir) return '📁';
		switch (ext) {
			case '.ts': case '.tsx': return '🔷';
			case '.js': case '.jsx': return '🟡';
			case '.svelte': return '🔶';
			case '.rs': return '🦀';
			case '.py': return '🐍';
			case '.go': return '🐹';
			case '.md': return '📝';
			case '.json': return '📋';
			case '.css': return '🎨';
			case '.html': return '🌐';
			case '.sh': return '📜';
			default: return '📄';
		}
	}

	async function checkFilePicker(val: string, cursorPos: number) {
		const textToCursor = val.slice(0, cursorPos);
		const match = /@(\/|\.\/)?([^@\s]*)$/.exec(textToCursor);
		if (!match) { filePickerOpen = false; return; }

		const trigger = match[0];
		const prefix = match[1] ?? '';
		const query = match[2] ?? '';
		filePickerTriggerStart = cursorPos - trigger.length;

		if (!prefix && !query) {
			const recent = getRecentFiles();
			filePickerResults = recent;
			filePickerOpen = recent.length > 0;
			filePickerIndex = 0;
			return;
		}

		if (!appState.projectPath) { filePickerOpen = false; return; }

		const queryLower = query.toLowerCase();
		const lastSlash = query.lastIndexOf('/');
		const dirPart = lastSlash >= 0 ? query.slice(0, lastSlash) : '';
		const filePart = lastSlash >= 0 ? query.slice(lastSlash + 1) : query;
		const dirToList = dirPart
			? appState.projectPath + '/' + dirPart
			: appState.projectPath;

		filePickerLoading = true;
		try {
			const entries = await api.listDir(dirToList);
			const filtered = entries
				.filter(e => {
					if (!filePart) return true;
					return e.name.toLowerCase().startsWith(filePart.toLowerCase());
				})
				.slice(0, 10)
				.map(e => ({
					name: e.name,
					path: e.path,
					isDir: e.is_dir,
					ext: getExt(e.name),
				}));
			const currentQuery = val.slice(0, textareaEl?.selectionStart ?? val.length);
			const stillMatch = /@(\/|\.\/)?([^@\s]*)$/.exec(currentQuery);
			if (!stillMatch) { filePickerOpen = false; return; }
			filePickerResults = filtered;
			filePickerOpen = filtered.length > 0;
			filePickerIndex = 0;
		} catch {
			filePickerOpen = false;
		} finally {
			filePickerLoading = false;
		}
	}

	async function selectFilePicker(entry: FilePickerEntry) {
		const el = textareaEl;
		if (!el) return;
		const cursorPos = el.selectionStart;
		const relPath = appState.projectPath
			? entry.path.replace(appState.projectPath, '').replace(/^\//, '')
			: entry.path;

		input = input.slice(0, filePickerTriggerStart) + input.slice(cursorPos);
		filePickerOpen = false;
		filePickerQuery = '';

		const pill: ComposePill = { name: entry.name, path: relPath };
		if (!entry.isDir && TEXT_EXTENSIONS.includes(entry.ext) && appState.projectPath) {
			try {
				const content = await api.readFile(entry.path);
				pill.content = content.slice(0, 8000);
			} catch {}
		}
		composePills = [...composePills, pill];

		await tick();
		if (!el) return;
		el.setSelectionRange(filePickerTriggerStart, filePickerTriggerStart);
		el.focus();
		autoResize();
	}

	let mentionFiltered = $derived(
		(appState.agents ?? [])
			.filter(a => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
			.slice(0, 8)
	);

	function checkMention(val: string, cursorPos: number) {
		const textToCursor = val.slice(0, cursorPos);
		const match = /@(\S*)$/.exec(textToCursor);
		if (match) {
			mentionQuery = match[1];
			mentionActive = mentionFiltered.length > 0;
			mentionIndex = 0;
		} else {
			mentionActive = false;
		}
	}

	function selectMention(agent: { id: string; name: string }) {
		const el = textareaEl;
		if (!el) return;
		const cursorPos = el.selectionStart;
		const textToCursor = input.slice(0, cursorPos);
		const match = /@(\S*)$/.exec(textToCursor);
		if (!match) return;
		const start = cursorPos - match[0].length;
		const replacement = `@${agent.name} `;
		input = input.slice(0, start) + replacement + input.slice(cursorPos);
		pendingAgentId = agent.id;
		mentionActive = false;
		mentionQuery = '';
		tick().then(() => {
			if (!el) return;
			const newPos = start + replacement.length;
			el.setSelectionRange(newPos, newPos);
			el.focus();
		});
	}


	function onKeydown(e: KeyboardEvent) {
		if (filePickerOpen) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				filePickerIndex = Math.min(filePickerIndex + 1, filePickerResults.length - 1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				filePickerIndex = Math.max(filePickerIndex - 1, 0);
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				const selected = filePickerResults[filePickerIndex];
				if (selected) selectFilePicker(selected);
				return;
			}
			if (e.key === 'Escape') {
				filePickerOpen = false;
				return;
			}
		}
		if (mentionActive) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				mentionIndex = Math.min(mentionIndex + 1, mentionFiltered.length - 1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				mentionIndex = Math.max(mentionIndex - 1, 0);
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				const selected = mentionFiltered[mentionIndex];
				if (selected) selectMention(selected);
				return;
			}
			if (e.key === 'Escape') {
				mentionActive = false;
				return;
			}
		}
		if (e.key === 'ArrowUp' && (input.trim() === '' || historyIndex >= 0)) {
			if (sentHistory.length === 0) return;
			e.preventDefault();
			const next = Math.min(historyIndex + 1, sentHistory.length - 1);
			historyIndex = next;
			input = sentHistory[sentHistory.length - 1 - next];
			return;
		}
		if (e.key === 'ArrowDown' && historyIndex >= 0) {
			e.preventDefault();
			const next = historyIndex - 1;
			if (next < 0) {
				historyIndex = -1;
				input = '';
			} else {
				historyIndex = next;
				input = sentHistory[sentHistory.length - 1 - next];
			}
			return;
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
</script>

{#if modelPickerOpen}
	<button class="model-backdrop" aria-label="Close model picker" onclick={() => (modelPickerOpen = false)}></button>
{/if}
{#if agentPickerOpen}
	<button class="model-backdrop" aria-label="Close agent picker" onclick={() => (agentPickerOpen = false)}></button>
{/if}

<div class="compose-wrap">
	{#if modelPickerOpen}
		<div class="model-popover">
			{#each PROVIDERS as provider (provider.id)}
				<div class="mpop-section">{provider.label}</div>
				{#if provider.id === 'ollama'}
					{#if ollamaLoading}
						<div class="mpop-empty">Fetching models…</div>
					{:else if ollamaModels.length === 0}
						<div class="mpop-empty">No models found — run: ollama pull &lt;model&gt;</div>
					{:else}
						{#each ollamaModels as m (m)}
							<button
								class="mpop-item"
								class:active={selectedModel === m}
								onclick={() => selectModel('ollama', m)}
							>
								<span class="mpop-label">{m}</span>
							</button>
						{/each}
					{/if}
				{:else}
					{#each provider.models as model (model.id)}
						<button
							class="mpop-item"
							class:active={selectedModel === model.id}
							onclick={() => selectModel(provider.id, model.id)}
						>
							<span class="mpop-label">{model.label}</span>
							<span class="mpop-id">{model.id}</span>
						</button>
					{/each}
				{/if}
			{/each}
			<div class="mpop-divider"></div>
			<div class="mpop-section">Effort</div>
			{#each ([
				{ id: 'low',    label: 'Low',    desc: 'fast, focused',  temp: 0.3 },
				{ id: 'medium', label: 'Medium', desc: 'balanced',       temp: 1.0 },
				{ id: 'high',   label: 'High',   desc: 'thorough',       temp: 1.5 },
			] as const) as effort (effort.id)}
				<button
					class="mpop-effort-item"
					class:active={Math.abs(appState.temperature - effort.temp) < 0.01}
					onclick={() => { appState.temperature = effort.temp; }}
				>
					<span class="effort-radio">{Math.abs(appState.temperature - effort.temp) < 0.01 ? '●' : '○'}</span>
					<span class="mpop-label">{effort.label}</span>
					<span class="mpop-id">{effort.desc}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if mentionActive && mentionFiltered.length > 0}
		<div class="mention-dropdown">
			{#each mentionFiltered as agent, i (agent.id)}
				<button
					class="mention-item"
					class:mention-active={i === mentionIndex}
					onclick={() => selectMention(agent)}
				>
					<span class="mention-name">{agent.name}</span>
					<span class="mention-model">{agent.model}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if filePickerOpen && filePickerResults.length > 0}
		<div class="file-picker-popover">
			<div class="file-picker-header">
				<span class="file-picker-label">{filePickerLoading ? 'Searching...' : 'Files'}</span>
				<span class="file-picker-hint">↑↓ navigate · Enter to insert · Esc to close</span>
			</div>
			{#each filePickerResults as entry, i (entry.path)}
				<button
					class="file-picker-item"
					class:file-picker-active={i === filePickerIndex}
					onclick={() => selectFilePicker(entry)}
				>
					<span class="file-picker-icon">{fileIcon(entry.ext, entry.isDir)}</span>
					<span class="file-picker-name">{entry.name}</span>
					<span class="file-picker-path">{entry.path.replace(appState.projectPath ?? '', '').replace(/^\//, '')}</span>
				</button>
			{/each}
		</div>
	{/if}

	<div
		class="compose"
		role="region"
		aria-label="Compose message"
		ondragover={(e) => e.preventDefault()}
		ondrop={onDrop}
	>
		<div class="compose-breadcrumb">
			<button class="crumb-tab" onclick={(e) => { e.stopPropagation(); togglePopover('local', e.currentTarget as HTMLElement); }}>Local</button>
			{#if appState.projectPath}
				<span class="crumb-sep">/</span>
				<button class="crumb-tab" onclick={(e) => { e.stopPropagation(); togglePopover('project', e.currentTarget as HTMLElement); }}>{projectName}</button>
			{/if}
			{#if gitInfo}
				<span class="crumb-sep">/</span>
				<button class="crumb-tab crumb-tab-active" onclick={(e) => { e.stopPropagation(); togglePopover('branch', e.currentTarget as HTMLElement); }}>{gitInfo.branch}</button>
				<span class="crumb-status" class:crumb-dirty={gitInfo.dirty}>●</span>
			{/if}
			<button class="crumb-add" onclick={(e) => { e.stopPropagation(); togglePopover('add', e.currentTarget as HTMLElement); }}>+</button>
		</div>

		{#if composePills.length > 0 || pastedImage}
			<div class="compose-pills">
				{#if pastedImage}
					<div class="compose-pill">
						<img src={pastedImage.dataUrl} alt="" class="pill-thumb" />
						<span class="pill-label">image</span>
						<button class="compose-pill-remove" onclick={() => (pastedImage = null)}>×</button>
					</div>
				{/if}
				{#each composePills as pill, i (pill.path)}
					<div class="compose-pill">
						<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
							<rect x="1.5" y="0.5" width="7" height="9" rx="1" stroke="currentColor" stroke-width="1"/>
							<line x1="3.5" y1="3.5" x2="6.5" y2="3.5" stroke="currentColor" stroke-width="0.8"/>
							<line x1="3.5" y1="5.5" x2="6.5" y2="5.5" stroke="currentColor" stroke-width="0.8"/>
						</svg>
						<span class="pill-label">{pill.name}</span>
						<button class="compose-pill-remove" onclick={() => removePill(i)}>×</button>
					</div>
				{/each}
			</div>
		{/if}

		<textarea
			bind:this={textareaEl}
			bind:value={input}
			class="compose-input"
			placeholder="How can I help?"
			rows={1}
			oninput={() => { autoResize(); checkMention(input, textareaEl?.selectionStart ?? input.length); checkFilePicker(input, textareaEl?.selectionStart ?? input.length); saveDraft(input); }}
			onkeydown={onKeydown}
			onpaste={onPaste}
		></textarea>

		<div class="compose-toolbar">
			<div class="toolbar-left">
				<div class="agent-sel-wrap">
					{#if agentPickerOpen}
						<div class="agent-popover">
							{#if appState.agents.length === 0}
								<div class="agent-pop-empty">No agents — create one</div>
							{:else}
								{#each appState.agents as agent (agent.id)}
									<button
										class="agent-pop-item"
										onclick={() => { appState.activeAgentId = agent.id; agentPickerOpen = false; }}
									>
										<span class="agent-pop-name">{agent.name}</span>
										<span class="agent-pop-model">{agent.model}</span>
										{#if appState.activeAgentId === agent.id}
											<svg class="agent-check" width="10" height="10" viewBox="0 0 10 10" fill="none">
												<path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
											</svg>
										{/if}
									</button>
								{/each}
							{/if}
							<button class="agent-pop-new" onclick={() => { appState.agentsPageOpen = true; agentPickerOpen = false; }}>New agent...</button>
						</div>
					{/if}
					<button class="agent-sel-btn" onclick={() => (agentPickerOpen = !agentPickerOpen)}>
						<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
							<circle cx="5.5" cy="3.5" r="2" stroke="currentColor" stroke-width="1.1"/>
							<path d="M1 10c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
						</svg>
						{#if appState.activeAgentId}
							{appState.agents.find(a => a.id === appState.activeAgentId)?.name ?? 'Default'}
						{:else}
							Default
						{/if}
						<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
							<path d="M1.5 2.5L4 5 6.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				</div>
				<button class="toolbar-icon-btn" onclick={(e) => { e.stopPropagation(); togglePopover('add', e.currentTarget as HTMLElement); }}>+</button>
				<button class="pill-count" onclick={() => textareaEl?.focus()}>{composePills.length}</button>
			</div>
			<div class="toolbar-right">
				<button class="model-btn" onclick={() => modelPickerOpen ? (modelPickerOpen = false) : openModelPicker()}>
					{modelLabel()}
					<svg width="9" height="9" viewBox="0 0 9 9" fill="none">
						<path d="M2 3l2.5 2.5L7 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				{#if appState.streaming}
					<div class="stop-wrap">
						<span class="stop-elapsed">{fmtStopElapsed(stopElapsed)}</span>
						<button class="stop-btn" onclick={() => (appState.streaming = false)}>Stop</button>
					</div>
				{:else}
					<button class="send-btn" aria-label="Send message" disabled={!canSend} onclick={send}>
						<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
							<path d="M5.5 9V2M3 4.5L5.5 2 8 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>


<style>
.compose-wrap {
	padding: 8px var(--editor-margin, 16px) 16px;
	flex-shrink: 0;
	position: relative;
}

.compose {
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--panel-radius, 6px);
	transition: border-color var(--transition);
}
.compose:focus-within {
	border-color: var(--border-active);
}

.compose-input {
	width: 100%;
	background: none;
	border: none;
	outline: none;
	resize: none;
	padding: 12px 14px 6px;
	font-size: 13px;
	font-family: var(--font-ui);
	line-height: 1.6;
	color: var(--text);
	min-height: 64px;
	max-height: 200px;
	overflow-y: auto;
	field-sizing: content;
}
.compose-input::placeholder { color: var(--text-muted); }

.compose-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 10px 8px;
}
.toolbar-left { display: flex; align-items: center; gap: 6px; }
.toolbar-right { display: flex; align-items: center; gap: 6px; }


.model-btn {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 11px;
	color: var(--text-muted);
	padding: 3px 7px;
	border-radius: var(--radius-full);
	border: 1px solid var(--stroke-tertiary);
	transition: background var(--transition), border-color var(--transition);
}
.model-btn:hover {
	background: var(--bg-hover);
	border-color: var(--stroke-secondary);
	color: var(--text-secondary);
}

.send-btn {
	width: 26px;
	height: 26px;
	border-radius: 5px;
	background: var(--text);
	color: var(--bg);
	display: flex;
	align-items: center;
	justify-content: center;
	transition: opacity var(--transition);
}
.send-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.send-btn:not(:disabled):hover { opacity: 0.8; }

.stop-wrap {
	display: flex;
	align-items: center;
	gap: 6px;
}
.stop-elapsed {
	font-size: 10px;
	color: var(--text-muted);
	font-variant-numeric: tabular-nums;
	min-width: 26px;
	text-align: right;
}
.stop-btn {
	height: 26px;
	padding: 0 10px;
	border-radius: 5px;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	color: var(--text-secondary);
	font-size: 11px;
	font-weight: 500;
	display: flex;
	align-items: center;
	transition: background var(--transition), color var(--transition);
}
.stop-btn:hover { background: var(--bg-hover); color: var(--text); }

/* Model picker popover */
.model-backdrop {
	position: fixed;
	inset: 0;
	z-index: 99;
}

.model-popover {
	position: absolute;
	bottom: calc(100% + 6px);
	left: 20px;
	width: 300px;
	max-height: 420px;
	overflow-y: auto;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-overlay);
	z-index: 100;
	padding: 4px 0;
	animation: fade-in 100ms ease;
	scrollbar-width: thin;
}

@keyframes fade-in {
	from { opacity: 0; transform: translateY(4px); }
	to { opacity: 1; transform: translateY(0); }
}

.mpop-section {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-muted);
	padding: 8px 12px 2px;
}

.mpop-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	padding: 5px 12px;
	gap: 8px;
	font-size: 12px;
	color: var(--text-secondary);
	transition: background var(--transition);
	text-align: left;
}
.mpop-item:hover { background: var(--bg-hover); color: var(--text); }
.mpop-item.active { background: var(--bg-active); color: var(--text); }
.mpop-item.active .mpop-label { color: var(--accent); }

.mpop-label {
	font-size: 12px;
	color: var(--text);
	flex-shrink: 0;
}
.mpop-id {
	font-size: 10px;
	color: var(--text-muted);
	font-family: monospace;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}


.mention-dropdown {
	position: absolute;
	bottom: calc(100% - 10px);
	left: 20px;
	right: 20px;
	max-width: 760px;
	margin: 0 auto;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: 4px;
	box-shadow: var(--shadow-overlay);
	z-index: 200;
	overflow: hidden;
	animation: fade-in 80ms ease;
}

.mention-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	width: 100%;
	padding: 6px 12px;
	font-size: 12px;
	color: var(--text-secondary);
	text-align: left;
	transition: background var(--transition);
}
.mention-item:hover,
.mention-item.mention-active {
	background: var(--bg-hover);
	color: var(--text);
}

.mention-name {
	font-size: 12px;
	color: var(--text);
	flex-shrink: 0;
}
.mention-model {
	font-size: 10px;
	font-family: monospace;
	color: var(--text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.mention-item:hover .mention-name,
.mention-item.mention-active .mention-name {
	color: var(--accent);
}

.file-picker-popover {
	position: absolute;
	bottom: calc(100% - 10px);
	left: 20px;
	right: 20px;
	max-width: 760px;
	margin: 0 auto;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: 4px;
	box-shadow: var(--shadow-overlay);
	z-index: 200;
	overflow: hidden;
	animation: fade-in 80ms ease;
}

.file-picker-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 5px 12px;
	border-bottom: 1px solid var(--stroke-tertiary);
}

.file-picker-label {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--text-muted);
}

.file-picker-hint {
	font-size: 10px;
	color: var(--text-muted);
	opacity: 0.6;
}

.file-picker-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 6px 12px;
	font-size: 12px;
	color: var(--text-secondary);
	text-align: left;
	transition: background var(--transition);
}
.file-picker-item:hover,
.file-picker-item.file-picker-active {
	background: var(--bg-hover);
	color: var(--text);
}
.file-picker-item.file-picker-active .file-picker-name {
	color: var(--accent);
}

.file-picker-icon {
	font-size: 13px;
	line-height: 1;
	flex-shrink: 0;
}

.file-picker-name {
	font-size: 12px;
	color: var(--text);
	flex-shrink: 0;
	white-space: nowrap;
}

.file-picker-path {
	font-size: 10px;
	font-family: monospace;
	color: var(--text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}



/* Breadcrumb bar */
.compose-breadcrumb {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 5px 10px 0;
	height: 22px;
	font-size: 10px;
	color: var(--text-tertiary);
	opacity: 0.7;
}

.crumb-tab {
	font-size: 11px;
	color: var(--text-muted);
	padding: 2px 5px;
	border-radius: 4px;
	transition: background var(--transition), color var(--transition);
}
.crumb-tab:hover { background: var(--bg-hover); color: var(--text-secondary); }
.crumb-tab-active { color: var(--text-secondary); font-weight: 500; }

.crumb-sep {
	color: var(--border-mid);
	user-select: none;
	padding: 0 1px;
}

.crumb-status {
	font-size: 7px;
	color: var(--green, #4ade80);
	margin-left: 2px;
	line-height: 1;
}
.crumb-dirty { color: var(--yellow, #fbbf24); }

.crumb-add {
	margin-left: auto;
	font-size: 14px;
	font-weight: 300;
	color: var(--text-muted);
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	line-height: 1;
	transition: background var(--transition), color var(--transition);
}
.crumb-add:hover { background: var(--bg-hover); color: var(--text-secondary); }

/* Compose pills */
.compose-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	padding: 4px 10px 0;
}

.compose-pill {
	display: flex;
	align-items: center;
	gap: 4px;
	height: 22px;
	padding: 0 6px 0 7px;
	background: var(--bg-panel);
	border: 1px solid var(--border);
	border-radius: 5px;
	font-size: 11px;
	color: var(--text-secondary);
}

.pill-label {
	max-width: 140px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pill-thumb {
	width: 16px;
	height: 16px;
	object-fit: cover;
	border-radius: 2px;
}

.compose-pill-remove {
	font-size: 12px;
	color: var(--text-muted);
	line-height: 1;
	padding: 0 1px;
	transition: color var(--transition);
}
.compose-pill-remove:hover { color: var(--text); }

/* Toolbar icon btn (the +) */
.toolbar-icon-btn {
	width: 22px;
	height: 22px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 16px;
	font-weight: 300;
	color: var(--text-muted);
	border-radius: 4px;
	line-height: 1;
	transition: background var(--transition), color var(--transition);
}
.toolbar-icon-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

/* Pill count badge */
.pill-count {
	font-size: 10px;
	font-family: var(--font-mono);
	color: var(--text-muted);
	background: var(--bg-panel);
	border: 1px solid var(--border);
	border-radius: 3px;
	padding: 1px 5px;
}


/* Agent selector */
.agent-sel-wrap {
	position: relative;
}

.agent-sel-btn {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 11px;
	color: var(--text-muted);
	padding: 3px 7px;
	border-radius: var(--radius-full);
	border: 1px solid var(--stroke-tertiary);
	transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.agent-sel-btn:hover {
	background: var(--bg-hover);
	border-color: var(--stroke-secondary);
	color: var(--text-secondary);
}

.agent-popover {
	position: absolute;
	bottom: calc(100% + 6px);
	left: 0;
	min-width: 200px;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-overlay);
	z-index: 101;
	padding: 4px 0;
	animation: fade-in 100ms ease;
}

.agent-pop-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 5px 12px;
	font-size: 12px;
	color: var(--text-secondary);
	text-align: left;
	transition: background var(--transition);
}
.agent-pop-item:hover {
	background: var(--bg-hover);
	color: var(--text);
}

.agent-pop-name {
	font-weight: 600;
	flex: 1;
	color: var(--text);
}

.agent-pop-model {
	font-size: 10px;
	color: var(--text-muted);
}

.agent-check {
	color: var(--accent);
	flex-shrink: 0;
}

.agent-pop-empty {
	padding: 8px 12px;
	font-size: 12px;
	color: var(--text-muted);
}

.agent-pop-new {
	display: block;
	width: 100%;
	padding: 5px 12px;
	font-size: 12px;
	color: var(--accent);
	text-align: left;
	border-top: 1px solid var(--stroke-tertiary);
	margin-top: 2px;
	transition: background var(--transition);
}
.agent-pop-new:hover {
	background: var(--bg-hover);
}

/* Effort section in model picker */
.mpop-divider {
	height: 1px;
	background: var(--stroke-tertiary);
	margin: 4px 0;
}

.mpop-effort-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 5px 12px;
	font-size: 12px;
	color: var(--text-secondary);
	text-align: left;
	transition: background var(--transition);
}
.mpop-effort-item:hover {
	background: var(--bg-hover);
	color: var(--text);
}
.mpop-effort-item.active {
	background: var(--bg-active);
	color: var(--text);
}
.mpop-effort-item.active .mpop-label {
	color: var(--accent);
}

.effort-radio {
	font-size: 10px;
	color: var(--accent);
	flex-shrink: 0;
	width: 12px;
}
</style>
