<script lang="ts">
	import { appState } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import type { Message } from '$lib/types';
	import { listen } from '@tauri-apps/api/event';
	import { marked } from 'marked';
	import hljs from 'highlight.js';
	import { onMount } from 'svelte';

	marked.setOptions({ gfm: true, breaks: true });
	// @ts-ignore
	marked.use({
		renderer: (() => {
			const r = new (marked as any).Renderer();
			r.code = (code: string, lang: string) => {
				const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
				const highlighted = hljs.highlight(code, { language }).value;
				return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
			};
			return r;
		})(),
	});

	function renderMarkdown(content: string): string {
		return marked.parse(content) as string;
	}

	type PendingTool = {
		id: string;
		name: string;
		input: Record<string, unknown>;
		permissionKey: string;
		dangerous: boolean;
		dangerReason?: string;
		status: 'pending' | 'approved' | 'denied' | 'done';
		output?: string;
		isError?: boolean;
	};

	type FileDiffEvent = { path: string; before: string | null; after: string; tool: string };

	let messagesEl = $state<HTMLElement | null>(null);
	let pendingTools = $state<PendingTool[]>([]);
	let fileDiffs = $state<FileDiffEvent[]>([]);
	let expandedDiffs = $state<Set<number>>(new Set());
	let expandedOutputs = $state<Set<string>>(new Set());
	let copiedMsgId = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	let userScrolledUp = $state(false);
	let unreadCount = $state(0);
	let lastStreamFailed = $state(false);
	let chipsVisible = $state(true);

	const QUICK_REPLIES = ['Continue', 'Explain more', 'Give an example'];

	const lastMsg = $derived(appState.messages[appState.messages.length - 1] ?? null);
	const showChips = $derived(
		chipsVisible &&
		!appState.streaming &&
		appState.messages.length > 0 &&
		lastMsg?.role === 'assistant'
	);
	const showRetry = $derived(
		lastStreamFailed &&
		!appState.streaming &&
		lastMsg?.role === 'assistant'
	);

	async function sendChip(text: string) {
		if (!appState.activeSessionId || appState.streaming) return;
		chipsVisible = false;
		lastStreamFailed = false;
		const userMsg = {
			id: crypto.randomUUID(),
			session_id: appState.activeSessionId,
			role: 'user' as const,
			content: text,
			tool_name: null,
			tool_input: null,
			created_at: Date.now() / 1000,
		};
		appState.messages = [...appState.messages, userMsg];
		appState.streaming = true;
		appState.streamingContent = '';
		appState.streamingThinking = '';
		try {
			const mergedSystem = [appState.skillsContext, appState.globalSystemPrompt].filter(Boolean).join('\n\n') || undefined;
			const response = await api.streamMessage(appState.activeSessionId, text, {
				temperature: appState.temperature,
				maxTokens: appState.maxTokens ?? undefined,
				globalSystemPrompt: mergedSystem,
			});
			appState.messages = [
				...appState.messages,
				{
					id: crypto.randomUUID(),
					session_id: appState.activeSessionId,
					role: 'assistant' as const,
					content: appState.streamingContent || response,
					tool_name: null,
					tool_input: null,
					created_at: Date.now() / 1000,
				},
			];
			chipsVisible = true;
		} catch (err) {
			appState.messages = [
				...appState.messages,
				{
					id: crypto.randomUUID(),
					session_id: appState.activeSessionId,
					role: 'assistant' as const,
					content: `Error: ${err}`,
					tool_name: null,
					tool_input: null,
					created_at: Date.now() / 1000,
				},
			];
			lastStreamFailed = true;
		} finally {
			appState.streaming = false;
			appState.streamingContent = '';
			appState.streamingThinking = '';
		}
	}

	async function retryLast() {
		const lastUser = [...appState.messages].reverse().find(m => m.role === 'user');
		if (!lastUser) return;
		appState.messages = appState.messages.slice(0, -1);
		await sendChip(lastUser.content);
	}

	$effect(() => {
		if (!appState.streaming) {
			const last = appState.messages[appState.messages.length - 1];
			if (last?.role === 'assistant' && last.content.startsWith('Error:')) {
				lastStreamFailed = true;
				chipsVisible = false;
			}
		}
	});

	let streamStart = $state<number | null>(null);
	let elapsed = $state(0);
	let elapsedTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (appState.streaming) {
			streamStart = Date.now();
			elapsed = 0;
			elapsedTimer = setInterval(() => {
				elapsed = (Date.now() - (streamStart ?? Date.now())) / 1000;
			}, 100);
		} else {
			if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
			setTimeout(() => { streamStart = null; }, 3000);
		}
		return () => {
			if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
		};
	});

	const THINKING_LABELS = ['Thinking...', 'Analyzing...', 'Processing...', 'Considering...'];
	let thinkingLabelIdx = $state(0);
	let thinkingTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		const isThinking = appState.streaming && appState.streamingContent.length === 0;
		if (isThinking) {
			thinkingLabelIdx = 0;
			thinkingTimer = setInterval(() => {
				thinkingLabelIdx = (thinkingLabelIdx + 1) % THINKING_LABELS.length;
			}, 2000);
		} else {
			if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
		}
		return () => {
			if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
		};
	});

	const liveTps = $derived(
		appState.streaming && elapsed > 0.5
			? Math.round((appState.streamingContent.length / 4) / elapsed)
			: null
	);

	function handleMessagesScroll() {
		if (!messagesEl) return;
		const gap = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
		if (gap > 50) userScrolledUp = true;
		else if (gap < 30) { userScrolledUp = false; unreadCount = 0; }
	}

	function scrollToBottom() {
		if (!messagesEl) return;
		messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
		userScrolledUp = false;
		unreadCount = 0;
	}

	const REQUIRES_APPROVAL = new Set(['bash', 'write', 'edit']);

	function toolNeedsApproval(name: string): boolean {
		return REQUIRES_APPROVAL.has(name.toLowerCase());
	}

	function getPrimaryInputParam(name: string, input: Record<string, unknown>): string {
		const key =
			name === 'bash' ? 'command' :
			name === 'read' ? 'file_path' :
			name === 'write' ? 'file_path' :
			name === 'edit' ? 'file_path' :
			name === 'glob' ? 'pattern' :
			name === 'grep' ? 'pattern' :
			Object.keys(input)[0] ?? '';
		const val = input[key];
		const raw = val != null ? String(val) : JSON.stringify(input);
		return raw.length > 60 ? raw.slice(0, 60) + '…' : raw;
	}

	onMount(() => {
		const unlisten1 = listen<{ id: string; name: string; input_json: string; permission_key: string; dangerous: boolean; danger_reason?: string }>(
			'tool-pending',
			({ payload }) => {
				let parsed: Record<string, unknown> = {};
				try { parsed = JSON.parse(payload.input_json); } catch {}
				pendingTools = [
					...pendingTools,
					{
						id: payload.id,
						name: payload.name,
						input: parsed,
						permissionKey: payload.permission_key,
						dangerous: payload.dangerous,
						dangerReason: payload.danger_reason,
						status: 'pending',
					},
				];
			}
		);

		const unlisten2 = listen<{ id: string; name: string; content: string; is_error: boolean }>(
			'tool-result',
			({ payload }) => {
				pendingTools = pendingTools.map(t =>
					t.id === payload.id
						? { ...t, status: 'done', output: payload.content, isError: payload.is_error }
						: t
				);
			}
		);

		const unlistenDiff = listen<FileDiffEvent>('file-diff', ({ payload }) => {
			fileDiffs = [...fileDiffs, payload];
		});

		const unlistenThinking = listen<string>('ai-thinking', ({ payload }) => {
			appState.streamingThinking += payload;
		});

		const unlistenCompact = listen<string>('session-compacted', async ({ payload }) => {
			if (payload !== appState.activeSessionId) return;
			const msgs = await api.getMessages(payload);
			appState.messages = msgs;
		});

		return () => {
			unlisten1.then(fn => fn());
			unlisten2.then(fn => fn());
			unlistenDiff.then(fn => fn());
			unlistenThinking.then(fn => fn());
			unlistenCompact.then(fn => fn());
		};
	});

	$effect(() => {
		if ((appState.messages.length || appState.streaming) && messagesEl && !userScrolledUp) {
			messagesEl.scrollTop = messagesEl.scrollHeight;
		}
	});

	let prevMessageCount = $state(0);
	$effect(() => {
		const count = appState.messages.length;
		if (count > prevMessageCount && userScrolledUp) {
			unreadCount += count - prevMessageCount;
		}
		prevMessageCount = count;
	});

	$effect(() => {
		const id = appState.activeSessionId;
		pendingTools = [];
		fileDiffs = [];
		expandedDiffs = new Set();
		expandedOutputs = new Set();
		userScrolledUp = false;
		unreadCount = 0;
		prevMessageCount = 0;
		lastStreamFailed = false;
		chipsVisible = true;
	});

	$effect(() => {
		appState.messages;
		appState.streamingContent;
		appState.streaming;

		if (!messagesEl) return;

		queueMicrotask(() => {
			if (!messagesEl) return;
			const pres = messagesEl.querySelectorAll<HTMLPreElement>('pre');
			pres.forEach(pre => {
				if (pre.querySelector('.code-copy-btn')) return;
				const codeEl = pre.querySelector('code');
				if (!codeEl) return;

				const btn = document.createElement('button');
				btn.className = 'code-copy-btn';
				btn.textContent = 'Copy';
				btn.addEventListener('click', async () => {
					await navigator.clipboard.writeText(codeEl.innerText);
					btn.textContent = '✓';
					setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
				});
				pre.style.position = 'relative';
				pre.appendChild(btn);
			});

			messagesEl.querySelectorAll<HTMLElement>('pre code[class*="language-"]').forEach(code => {
				const match = [...code.classList].find(c => c.startsWith('language-'));
				if (!match) return;
				const lang = match.replace('language-', '');
				if (lang === 'plaintext' || lang === 'text') return;
				const pre = code.parentElement;
				if (!pre || pre.querySelector('.lang-label')) return;
				const label = document.createElement('span');
				label.className = 'lang-label';
				label.textContent = lang;
				pre.appendChild(label);
			});
		});
	});

	async function copyMessage(msg: Message) {
		await navigator.clipboard.writeText(msg.content);
		if (copyTimer) clearTimeout(copyTimer);
		copiedMsgId = msg.id;
		copyTimer = setTimeout(() => { copiedMsgId = null; }, 1500);
	}

	async function handleFork(msg: Message) {
		if (!appState.activeSessionId || appState.streaming) return;
		try {
			const forked = await api.forkSession(appState.activeSessionId, msg.id);
			appState.sessions = [forked, ...appState.sessions];
			appState.activeSessionId = forked.id;
			appState.messages = await api.getMessages(forked.id);
		} catch (err) {
			console.error('fork failed', err);
		}
	}

	async function handleRestore(msg: Message) {
		if (!appState.activeSessionId || appState.streaming) return;
		const hasCheckpoint = !!msg.checkpoint_sha;
		const warning = hasCheckpoint
			? 'Revert the chat and reset files in the worktree to this checkpoint? Any work after this point will be lost.'
			: 'Revert the chat to this point? No file snapshot is available — files on disk will not change.';
		if (!confirm(warning)) return;
		try {
			await api.revertToMessage(appState.activeSessionId, msg.id);
			appState.messages = await api.getMessages(appState.activeSessionId);
		} catch (err) {
			console.error('restore failed', err);
		}
	}

	async function handleApprove(tool: PendingTool) {
		pendingTools = pendingTools.map(t => t.id === tool.id ? { ...t, status: 'approved' } : t);
		await api.approveTool(tool.id, true);
	}

	async function handleDeny(tool: PendingTool) {
		pendingTools = pendingTools.map(t => t.id === tool.id ? { ...t, status: 'denied' } : t);
		await api.approveTool(tool.id, false);
	}

	async function handleAlwaysAllow(tool: PendingTool) {
		await api.alwaysAllowTool(tool.permissionKey);
		await handleApprove(tool);
	}

	const allToolsDone = $derived(
		pendingTools.length > 0 && pendingTools.every(t => t.status === 'done' || t.status === 'denied')
	);

	const OUTPUT_COLLAPSE_THRESHOLD = 1536;

	function toggleToolOutput(id: string) {
		const next = new Set(expandedOutputs);
		if (next.has(id)) next.delete(id); else next.add(id);
		expandedOutputs = next;
	}

	function truncateOutput(output: string, max = OUTPUT_COLLAPSE_THRESHOLD): { text: string; more: number } {
		if (output.length <= max) return { text: output, more: 0 };
		return { text: output.slice(0, max), more: output.length - max };
	}

	function basename(path: string): string {
		return path.split('/').pop() ?? path;
	}

	async function loadSkills(projectPath: string) {
		if (!projectPath) { appState.skillsContext = ''; return; }
		try {
			const skillsDir = projectPath.replace(/\/$/, '') + '/.agents/skills';
			const entries = await api.listDir(skillsDir);
			const mdFiles = entries.filter(e => !e.is_dir && e.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name));
			if (mdFiles.length === 0) { appState.skillsContext = ''; return; }
			const parts: string[] = [];
			for (const file of mdFiles) {
				try {
					const content = await api.readFile(file.path);
					parts.push(`# ${file.name.replace(/\.md$/, '')}\n${content}`);
				} catch {}
			}
			appState.skillsContext = parts.length > 0
				? `<skills>\n${parts.join('\n\n')}\n</skills>`
				: '';
		} catch {
			appState.skillsContext = '';
		}
	}

	$effect(() => {
		loadSkills(appState.projectPath);
	});

	function toggleDiff(idx: number) {
		const next = new Set(expandedDiffs);
		if (next.has(idx)) next.delete(idx);
		else next.add(idx);
		expandedDiffs = next;
	}

	type DiffLine = { type: 'added' | 'removed' | 'unchanged'; text: string };

	function computeDiff(before: string | null, after: string): DiffLine[] {
		if (!before) return after.split('\n').map(l => ({ type: 'added' as const, text: l }));
		const beforeLines = before.split('\n');
		const afterLines = after.split('\n');
		const result: DiffLine[] = [];
		const maxLen = Math.max(beforeLines.length, afterLines.length);
		for (let i = 0; i < maxLen; i++) {
			const b = beforeLines[i];
			const a = afterLines[i];
			if (b === a) { result.push({ type: 'unchanged', text: b ?? '' }); }
			else {
				if (b !== undefined) result.push({ type: 'removed', text: b });
				if (a !== undefined) result.push({ type: 'added', text: a });
			}
		}
		return result;
	}

	function filterDiffContext(lines: DiffLine[]): DiffLine[] {
		const CONTEXT = 2;
		const changed = new Set<number>();
		lines.forEach((l, i) => { if (l.type !== 'unchanged') changed.add(i); });
		const visible = new Set<number>();
		changed.forEach(i => {
			for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
				visible.add(j);
			}
		});
		const result: DiffLine[] = [];
		let skipped = 0;
		for (let i = 0; i < lines.length; i++) {
			if (visible.has(i)) {
				if (skipped > 0) { result.push({ type: 'unchanged', text: `... (${skipped} lines)` }); skipped = 0; }
				result.push(lines[i]);
			} else { skipped++; }
		}
		if (skipped > 0) result.push({ type: 'unchanged', text: `... (${skipped} lines)` });
		return result;
	}
</script>

<div class="chat-pane">
	<div class="messages" bind:this={messagesEl} onscroll={handleMessagesScroll}>
		{#if userScrolledUp && (appState.streaming || appState.messages.length > 0)}
			<button class="scroll-to-bottom" onclick={scrollToBottom}>
				↓ Latest{#if unreadCount > 0}<span class="scroll-unread">+{unreadCount}</span>{/if}
			</button>
		{/if}

		<div class="messages-inner">
			{#each appState.messages as msg (msg.id)}
				<div class="message" id="msg-{msg.id}">
					{#if msg.role === 'user'}
						<div class="user-msg">
							<div class="msg-icon">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
									<circle cx="8" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.2"/>
									<path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
								</svg>
							</div>
							<div class="msg-body">{msg.content}</div>
						</div>
					{:else}
						<div class="asst-row">
							<div class="msg-icon msg-icon-asst">
								<svg width="16" height="16" viewBox="0 0 12 12" fill="none">
									<line x1="4" y1="1.5" x2="3" y2="10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
									<line x1="8" y1="1.5" x2="7" y2="10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
									<line x1="1.5" y1="4.5" x2="10.5" y2="4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
									<line x1="1.5" y1="7.5" x2="10.5" y2="7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
								</svg>
							</div>
							<div class="asst-msg-wrap">
								<div class="asst-msg">
									{@html renderMarkdown(msg.content)}
								</div>
								<div class="msg-actions">
									<button
										class="msg-action"
										class:copied={copiedMsgId === msg.id}
										onclick={() => copyMessage(msg)}
									>{copiedMsgId === msg.id ? '✓' : 'Copy'}</button>
									<button
										class="msg-action"
										title="Create a new session branching from this message"
										onclick={() => handleFork(msg)}
									>Fork</button>
									<button
										class="msg-action msg-action-restore"
										class:has-checkpoint={!!msg.checkpoint_sha}
										title={msg.checkpoint_sha
											? 'Revert chat + reset files to this checkpoint'
											: 'Revert chat to this message (no file snapshot available)'}
										onclick={() => handleRestore(msg)}
									>Restore</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/each}

			<!-- Tool rows (assistant band) -->
			{#if pendingTools.length > 0}
				<div class="tool-rows asst-band">
					{#each pendingTools as tool (tool.id)}
						{@const primary = getPrimaryInputParam(tool.name, tool.input)}
						{@const needsApproval = toolNeedsApproval(tool.name)}
						<div class="tool-row"
							class:tool-done={tool.status === 'done' && !tool.isError}
							class:tool-error={tool.isError}
							class:tool-denied={tool.status === 'denied'}
							class:tool-running={tool.status === 'pending' || tool.status === 'approved'}
						>
							<div class="tool-row-icon">
								{#if tool.status === 'done' && !tool.isError}
									<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4.5 8L8 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
								{:else if tool.status === 'denied' || tool.isError}
									<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
								{:else}
									<svg class="spin" width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 16" stroke-linecap="round"/></svg>
								{/if}
							</div>
							<span class="tool-row-name">{tool.name}</span>
							<span class="tool-row-label">{primary}</span>
							{#if tool.status === 'pending' && needsApproval}
								{#if tool.dangerous}
									<span class="tool-danger-badge" title={tool.dangerReason ?? 'dangerous'}>!</span>
								{/if}
								{#if tool.dangerReason}
									<span class="tool-danger-reason">{tool.dangerReason}</span>
								{/if}
								<button class="approval-allow" onclick={() => handleApprove(tool)}>Allow</button>
								<button class="approval-always" onclick={() => handleAlwaysAllow(tool)}>Always</button>
								<button class="approval-deny" onclick={() => handleDeny(tool)}>Deny</button>
							{/if}
						</div>
						{#if tool.output && tool.status === 'done'}
							{@const expanded = expandedOutputs.has(tool.id)}
							{@const { text, more } = truncateOutput(tool.output)}
							<div class="tool-output" class:tool-output-error={tool.isError}>
								<pre class="tool-output-pre">{expanded ? tool.output : text}</pre>
								{#if more > 0}
									<button class="tool-output-toggle" onclick={() => toggleToolOutput(tool.id)}>
										{expanded ? 'Collapse' : `Show ${Math.ceil((tool.output.length) / 1024)}KB output`}
									</button>
								{/if}
							</div>
						{/if}
					{/each}
					{#if allToolsDone && !appState.streaming}
						<div class="worked-row">
							<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4.5 8L8 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
							Worked {elapsed.toFixed(0)}s
							<span class="worked-sep">·</span>
							<button class="worked-link" title="Coming soon" disabled>checkpoint</button>
							<span class="worked-sep">·</span>
							<button class="worked-link" title="Coming soon" disabled>restore</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Streaming -->
			{#if appState.streaming}
				<div class="message asst-row">
					<div class="msg-icon msg-icon-asst">
						<svg width="16" height="16" viewBox="0 0 12 12" fill="none">
							<line x1="4" y1="1.5" x2="3" y2="10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
							<line x1="8" y1="1.5" x2="7" y2="10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
							<line x1="1.5" y1="4.5" x2="10.5" y2="4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
							<line x1="1.5" y1="7.5" x2="10.5" y2="7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
						</svg>
					</div>
					<div class="asst-msg-wrap">
						{#if appState.streamingThinking.length > 0}
							<details class="thinking-block" open>
								<summary>Thinking</summary>
								<pre class="thinking-body">{appState.streamingThinking}</pre>
							</details>
						{/if}
						{#if appState.streamingContent.length === 0 && appState.streamingThinking.length === 0}
							<div class="thinking-indicator">
								<span></span><span></span><span></span>
								<span class="thinking-label">{THINKING_LABELS[thinkingLabelIdx]}</span>
							</div>
						{:else if appState.streamingContent.length > 0}
							<div class="asst-msg streaming">
								{@html renderMarkdown(appState.streamingContent)}
								<span class="cursor-blink">▋</span>
								{#if liveTps !== null}<span class="stream-elapsed">{elapsed.toFixed(1)}s · ~{liveTps} t/s</span>{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Quick replies -->
			{#if showRetry}
				<div class="quick-replies">
					<button class="chip chip-retry" onclick={retryLast}>↺ Retry</button>
				</div>
			{:else if showChips}
				<div class="quick-replies">
					{#each QUICK_REPLIES as reply (reply)}
						<button class="chip" onclick={() => sendChip(reply)}>{reply}</button>
					{/each}
				</div>
			{/if}

			<!-- File diffs -->
			{#each fileDiffs as diff, idx (idx)}
				{@const expanded = expandedDiffs.has(idx)}
				{@const lines = expanded ? filterDiffContext(computeDiff(diff.before, diff.after)) : []}
				<div class="diff-panel">
					<button class="diff-header" onclick={() => toggleDiff(idx)}>
						<span class="diff-path" title={diff.path}>{basename(diff.path)}</span>
						<span class="diff-tool">{diff.tool}</span>
						<span class="diff-toggle">{expanded ? '▾' : '▸'}</span>
					</button>
					{#if expanded}
						<div class="diff-body">
							{#each lines as line}
								<div class="diff-line {line.type}">
									<span class="diff-line-prefix">{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span>
									{line.text}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			{#if appState.messages.length === 0 && !appState.streaming}
				<div class="empty-state">
					<div class="empty-logo">
						<svg width="24" height="24" viewBox="0 0 12 12" fill="none">
							<line x1="4" y1="1.5" x2="3" y2="10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
							<line x1="8" y1="1.5" x2="7" y2="10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
							<line x1="1.5" y1="4.5" x2="10.5" y2="4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
							<line x1="1.5" y1="7.5" x2="10.5" y2="7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
						</svg>
					</div>
					<p>What are we building today?</p>
				</div>
			{/if}
		</div>
	</div>

</div>

<style>
@import 'highlight.js/styles/github-dark.css';

.chat-pane {
	flex: 1;
	display: flex;
	flex-direction: column;
	height: 100%;
	min-width: 0;
	background: var(--bg-panel);
}

.messages {
	flex: 1;
	overflow-y: auto;
	padding-top: 0;
	scrollbar-width: thin;
	position: relative;
}
.messages-inner {
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0;
}

.message {
	display: flex;
	flex-direction: column;
	animation: fade-in 150ms ease;
}

/* Full-width alternating message bands */
.user-msg {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	background: var(--bg-panel);
	padding: 16px 20px 16px 15px;
	font-size: 13px;
	font-family: var(--font-ui);
	color: var(--text);
}

.user-msg .msg-body {
	flex: 1;
	min-width: 0;
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.6;
}

.asst-row {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	background: var(--bg-elevated);
	padding: 16px 20px 16px 15px;
}

.asst-msg-wrap {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.msg-icon {
	width: 16px;
	height: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	margin-top: 3px;
	color: var(--text-tertiary);
}

.msg-icon-asst { color: var(--text-secondary); }

.asst-msg {
	font-size: 13px;
	font-family: var(--font-ui);
	line-height: 1.65;
	color: var(--text);
	word-break: break-word;
}
.asst-msg :global(p) { margin: 0 0 0.75em; }
.asst-msg :global(p:last-child) { margin-bottom: 0; }
.asst-msg :global(ul), .asst-msg :global(ol) { padding-left: 1.4em; margin: 0 0 0.75em; }
.asst-msg :global(li) { margin-bottom: 0.25em; }
.asst-msg :global(h1), .asst-msg :global(h2), .asst-msg :global(h3) {
	font-size: 13px; font-weight: 600; margin: 1em 0 0.5em; color: var(--text);
}
.asst-msg :global(blockquote) {
	border-left: 2px solid var(--accent);
	margin: 0 0 0.75em;
	padding: 4px 12px;
	color: var(--text-secondary);
}
.asst-msg :global(code:not(pre code)) {
	font-family: var(--font-mono);
	font-size: 12px;
	background: var(--bg-elevated);
	outline: 1px solid var(--border);
	border-radius: 3px;
	padding: 1px 5px;
}
.asst-msg :global(pre) {
	background: color-mix(in srgb, var(--fg, #fff) 4%, var(--bg, #000));
	border-radius: var(--panel-radius, 6px);
	outline: 1px solid var(--border);
	outline-offset: -1px;
	padding: 12px;
	overflow-x: auto;
	margin: 0 0 0.75em;
	position: relative;
}
.asst-msg :global(pre code) { font-family: var(--font-mono); font-size: 12px; padding: 0; background: none; border: none; }
.asst-msg :global(.lang-label) {
	position: absolute; top: 8px; right: 40px;
	font-size: 10px; color: rgba(255,255,255,0.35);
	font-family: var(--font-mono); pointer-events: none;
}
.asst-msg :global(.code-copy-btn) {
	position: absolute; top: 6px; right: 8px;
	font-size: 10px; color: rgba(255,255,255,0.45);
	background: rgba(255,255,255,0.08); border-radius: 3px;
	padding: 2px 6px; cursor: pointer; border: none;
	transition: background 0.1s, color 0.1s;
}
.asst-msg :global(.code-copy-btn:hover) { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.85); }

.msg-actions {
	display: flex;
	gap: 4px;
	opacity: 0;
	transition: opacity var(--transition);
}
.message:hover .msg-actions { opacity: 1; }
.msg-action {
	font-size: 10px;
	color: var(--text-muted);
	padding: 1px 6px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--stroke-secondary);
	background: transparent;
	cursor: pointer;
	transition: background var(--transition), color var(--transition), border-color var(--transition);
}
.msg-action:hover { background: var(--bg-hover); color: var(--text-secondary); }
.msg-action.copied { color: var(--green); border-color: var(--green); }
.msg-action-restore.has-checkpoint { color: var(--accent, #6b8dff); border-color: var(--accent, #6b8dff); opacity: 0.8; }
.msg-action-restore.has-checkpoint:hover { opacity: 1; background: var(--bg-hover); }

/* Tool rows */
.tool-rows {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.asst-band {
	background: var(--bg-elevated);
	padding: 8px 20px 8px 15px;
}
.tool-row {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 28px;
	padding: 0 8px;
	border-radius: var(--radius-sm);
	font-size: 12px;
	color: var(--text-secondary);
}
.tool-row-icon {
	width: 16px;
	height: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.tool-done .tool-row-icon { color: var(--green); }
.tool-error .tool-row-icon, .tool-denied .tool-row-icon { color: var(--red); }
.tool-running .tool-row-icon { color: var(--accent); }
.tool-row-name {
	font-family: var(--font-mono);
	font-size: 11px;
	color: var(--text-muted);
	flex-shrink: 0;
}
.tool-row-label {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--font-mono);
	font-size: 11px;
	color: var(--text-secondary);
}
.approval-allow, .approval-deny {
	height: 20px;
	padding: 0 8px;
	border-radius: var(--radius-sm);
	font-size: 11px;
	font-weight: 500;
	flex-shrink: 0;
	cursor: pointer;
	border: none;
}
.approval-allow { background: var(--accent); color: #fff; }
.approval-allow:hover { opacity: 0.88; }
.approval-always { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
.approval-always:hover { color: var(--accent); border-color: var(--accent); }
.approval-deny { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); }
.approval-deny:hover { background: var(--bg-hover); color: var(--red); border-color: var(--red); }
.tool-danger-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 14px;
	height: 14px;
	border-radius: 50%;
	background: var(--red, #e05252);
	color: #fff;
	font-size: 9px;
	font-weight: 700;
	flex-shrink: 0;
}
.tool-danger-reason {
	font-size: 10px;
	color: var(--red, #e05252);
	opacity: 0.85;
	max-width: 200px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tool-output {
	margin: 0 8px 4px;
	border-radius: var(--radius-sm, 4px);
	background: var(--bg-overlay, rgba(0,0,0,0.2));
	overflow: hidden;
}
.tool-output-error { border-left: 2px solid var(--red, #e05252); }
.tool-output-pre {
	margin: 0;
	padding: 6px 8px;
	font-size: 10px;
	font-family: var(--font-mono, monospace);
	color: var(--text-muted);
	white-space: pre-wrap;
	word-break: break-all;
	max-height: 240px;
	overflow: auto;
}
.tool-output-toggle {
	display: block;
	width: 100%;
	padding: 3px 8px;
	font-size: 10px;
	color: var(--accent);
	background: none;
	border: none;
	border-top: 1px solid var(--stroke-tertiary, rgba(255,255,255,0.06));
	cursor: pointer;
	text-align: left;
}
.tool-output-toggle:hover { opacity: 0.8; }

.worked-row {
	display: flex;
	align-items: center;
	gap: 6px;
	height: 24px;
	padding: 0 8px;
	font-size: 11px;
	color: var(--text-muted);
}
.worked-row svg { color: var(--green); flex-shrink: 0; }
.worked-sep { color: var(--text-muted); opacity: 0.4; }
.worked-link {
	font-size: 11px;
	color: var(--text-muted);
	background: none;
	border: none;
	cursor: default;
	padding: 0;
	opacity: 0.5;
}

/* Spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }

/* Streaming */
.streaming { position: relative; }
.cursor-blink {
	display: inline-block;
	animation: blink 1s step-end infinite;
	font-size: 12px;
	line-height: 1;
	color: var(--accent);
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.stream-elapsed {
	font-size: 10px;
	color: var(--text-muted);
	margin-left: 4px;
	font-family: var(--font-mono);
}

/* Thinking */
.thinking-indicator {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 6px 0;
}
.thinking-indicator span:not(.thinking-label) {
	width: 5px; height: 5px;
	border-radius: 50%;
	background: var(--accent);
	animation: thinking-pulse 1.2s ease-in-out infinite;
}
.thinking-indicator span:nth-child(2) { animation-delay: 0.2s; }
.thinking-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes thinking-pulse { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
.thinking-label { font-size: 12px; color: var(--text-muted); margin-left: 4px; animation: fade-in 300ms ease; }

.thinking-block {
	margin-bottom: 8px;
	border: 1px solid var(--border-mid);
	border-radius: 6px;
	overflow: hidden;
}
.thinking-block summary {
	padding: 6px 10px;
	font-size: 11px;
	font-weight: 500;
	color: var(--text-muted);
	cursor: pointer;
	user-select: none;
	background: var(--bg-raised);
	letter-spacing: 0.04em;
	text-transform: uppercase;
}
.thinking-body {
	margin: 0;
	padding: 8px 12px;
	font-size: 11px;
	line-height: 1.6;
	color: var(--text-muted);
	white-space: pre-wrap;
	word-break: break-word;
	background: var(--bg);
	max-height: 300px;
	overflow-y: auto;
}

/* Scroll to bottom */
.scroll-to-bottom {
	position: sticky;
	top: 8px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 10;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 12px;
	background: var(--bg-elevated);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-full);
	font-size: 11px;
	color: var(--text-secondary);
	box-shadow: var(--shadow-md);
	cursor: pointer;
	transition: background var(--transition), color var(--transition);
}
.scroll-to-bottom:hover { background: var(--bg-hover); color: var(--text); }
.scroll-unread {
	background: var(--accent);
	color: #fff;
	border-radius: var(--radius-full);
	padding: 0 5px;
	font-size: 10px;
}

/* Quick replies */
.quick-replies { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0; }
.chip {
	height: 26px;
	padding: 0 10px;
	border-radius: var(--radius-full);
	border: 1px solid var(--border);
	background: var(--bg-elevated);
	font-size: 12px;
	color: var(--text-secondary);
	cursor: pointer;
	transition: background var(--transition), color var(--transition), border-color var(--transition);
}
.chip:hover { background: var(--bg-hover); color: var(--text); border-color: var(--stroke-primary); }
.chip-retry { color: var(--accent); border-color: var(--accent-dim); }
.chip-retry:hover { background: var(--accent-dim); }

/* Empty state */
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: var(--text-muted); }
.empty-logo { opacity: 0.2; }
.empty-state p { font-size: 13px; }

/* Diff panels */
.diff-panel {
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	overflow: hidden;
	font-size: 12px;
}
.diff-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	width: 100%;
	text-align: left;
	color: var(--text-secondary);
	transition: background var(--transition);
}
.diff-header:hover { background: var(--bg-hover); }
.diff-path { font-family: var(--font-mono); font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-tool { font-size: 10px; color: var(--text-muted); }
.diff-toggle { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.diff-body { font-family: var(--font-mono); font-size: 11px; line-height: 1.5; border-top: 1px solid var(--border); }
.diff-line { display: flex; gap: 8px; padding: 1px 10px; }
.diff-line.added { background: color-mix(in srgb, var(--green) 8%, transparent); color: var(--green); }
.diff-line.removed { background: color-mix(in srgb, var(--red) 8%, transparent); color: var(--red); }
.diff-line.unchanged { color: var(--text-muted); }
.diff-line-prefix { width: 10px; flex-shrink: 0; opacity: 0.6; }
</style>
