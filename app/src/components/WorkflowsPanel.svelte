<script lang="ts">
	import { appState } from '$lib/store.svelte';
	import { api } from '$lib/api';
	import { listen } from '@tauri-apps/api/event';
	import { onMount } from 'svelte';

	// ---- Types ----
	type StepType = 'prompt' | 'wait' | 'condition' | 'agent';
	type DelayUnit = 'seconds' | 'minutes' | 'hours';

	type WorkflowStep = {
		id: string;
		name: string;
		prompt: string;
		type?: StepType;
		delay?: number;
		delayUnit?: DelayUnit;
		condition?: string;
		humanGate?: boolean;
		agentId?: string;
		skipOnFail?: boolean;
		notes?: string;
		repeat?: number;
	};

	type Workflow = { id: string; name: string; description: string; steps: WorkflowStep[] };

	// ---- Workflow definitions ----
	const WORKFLOWS: Workflow[] = [
		{
			id: 'plan-implement-validate',
			name: 'Plan → Implement → Validate',
			description: 'Break down a task, implement it, then verify correctness.',
			steps: [
				{ id: 's1', name: 'Plan', prompt: 'Break down this task into a clear implementation plan. List the specific steps, files to change, and potential issues.' },
				{ id: 's2', name: 'Implement', prompt: 'Now implement the plan from the previous step. Write the actual code changes.' },
				{ id: 's3', name: 'Validate', prompt: 'Review the implementation. Check for bugs, edge cases, and adherence to the original requirements. Suggest any fixes.' },
			],
		},
		{
			id: 'bug-hunt',
			name: 'Bug Hunt',
			description: 'Systematically find and fix a bug.',
			steps: [
				{ id: 's1', name: 'Diagnose', prompt: 'Analyze the bug. Identify the root cause, affected code paths, and reproduce steps.' },
				{ id: 's2', name: 'Fix', prompt: 'Apply the fix based on your diagnosis. Write the corrected code.' },
			],
		},
		{
			id: 'refactor-sprint',
			name: 'Refactor Sprint',
			description: 'Systematically improve code quality.',
			steps: [
				{ id: 's1', name: 'Audit', prompt: 'Audit the code for: duplication, naming issues, complexity, missing abstractions. List findings.' },
				{ id: 's2', name: 'Prioritize', prompt: 'Rank the findings by impact. Pick the top 3 to refactor now.' },
				{ id: 's3', name: 'Refactor', prompt: 'Apply the top 3 refactors. Write the improved code.' },
				{ id: 's4', name: 'Review', prompt: 'Compare before and after. Confirm the refactors improved clarity without breaking behavior.' },
			],
		},
		{
			id: 'security-audit',
			name: 'Security Audit',
			description: 'Identify and fix security vulnerabilities across the codebase.',
			steps: [
				{ id: 's1', name: 'Auth Gaps', prompt: 'List all API routes and identify authentication gaps.' },
				{ id: 's2', name: 'Vuln Scan', prompt: 'Check for SQL injection, XSS, CSRF vulnerabilities in the codebase.' },
				{ id: 's3', name: 'Secrets', prompt: 'Review secret management: look for hardcoded credentials or tokens.' },
				{ id: 's4', name: 'Human Review', prompt: 'Review security findings and decide which to address.', humanGate: true },
				{ id: 's5', name: 'Fix', prompt: 'Fix the highest priority security issues found.' },
				{ id: 's6', name: 'Report', prompt: 'Generate a security audit report with all findings and fixes.' },
			],
		},
		{
			id: 'documentation-sprint',
			name: 'Documentation Sprint',
			description: 'Write comprehensive documentation for undocumented code.',
			steps: [
				{ id: 's1', name: 'Inventory', prompt: 'List all public functions and modules that lack documentation.' },
				{ id: 's2', name: 'Docstrings', prompt: 'Write JSDoc/docstring for each undocumented function.' },
				{ id: 's3', name: 'README', prompt: 'Generate a README section for the module.' },
				{ id: 's4', name: 'Examples', prompt: 'Create usage examples for the 3 most complex functions.' },
				{ id: 's5', name: 'Human Review', prompt: 'Review and approve the documentation.', humanGate: true },
			],
		},
		{
			id: 'code-quality-sweep',
			name: 'Code Quality Sweep',
			description: 'Fix lint errors, dead code, and overly complex functions.',
			steps: [
				{ id: 's1', name: 'Lint', prompt: 'Run a lint analysis and list all warnings and errors.' },
				{ id: 's2', name: 'Fix Lint', prompt: 'Fix all lint errors, starting with the most critical.' },
				{ id: 's3', name: 'Dead Code', prompt: 'Identify dead code, unused imports, and redundant logic.' },
				{ id: 's4', name: 'Cleanup', prompt: 'Remove dead code and clean up unused imports.' },
				{ id: 's5', name: 'Complexity', prompt: 'Check for overly complex functions (>50 lines) and suggest refactors.' },
				{ id: 's6', name: 'Human Review', prompt: 'Approve refactoring plan before changes.', humanGate: true },
				{ id: 's7', name: 'Refactor', prompt: 'Apply approved refactors.' },
			],
		},
		{
			id: 'deploy-rollback-plan',
			name: 'Deploy & Rollback Plan',
			description: 'Prepare a deployment checklist and rollback strategy.',
			steps: [
				{ id: 's1', name: 'Change Summary', prompt: 'Review recent commits and summarize changes going to production.' },
				{ id: 's2', name: 'Migrations', prompt: 'Identify any database migrations and check for backward compatibility.' },
				{ id: 's3', name: 'Checklist', prompt: 'Write a deployment checklist with health checks and smoke tests.' },
				{ id: 's4', name: 'Human Review', prompt: 'Confirm deployment checklist is complete.', humanGate: true },
				{ id: 's5', name: 'Rollback', prompt: 'Write a rollback plan with specific steps if deployment fails.' },
			],
		},
		{
			id: 'feature-estimation',
			name: 'Feature Estimation',
			description: 'Break down and estimate a feature with a technical design doc.',
			steps: [
				{ id: 's1', name: 'Task Breakdown', prompt: 'Break down the feature into concrete engineering tasks.' },
				{ id: 's2', name: 'Estimates', prompt: 'Estimate each task in story points (1/2/3/5/8/13).' },
				{ id: 's3', name: 'Risks', prompt: 'Identify dependencies, risks, and unknowns.' },
				{ id: 's4', name: 'Design Doc', prompt: 'Write a technical design doc outline for the feature.' },
				{ id: 's5', name: 'Human Review', prompt: 'Review estimates and design with team.', humanGate: true },
			],
		},
	];

	// ---- State ----
	type WorkflowPhase =
		| { phase: 'idle' }
		| { phase: 'setup'; workflowId: string; taskDescription: string }
		| { phase: 'running'; workflowId: string; currentStep: number; sessionId: string; stepOutputs: string[] }
		| { phase: 'done'; workflowId: string; sessionId: string };

	let selectedId = $state(WORKFLOWS[0].id);
	let wfState = $state<WorkflowPhase>({ phase: 'idle' });
	let taskInput = $state('');
	let streamingContent = $state('');
	let stepComplete = $state(false);
	let running = $state(false);

	// Wait step state
	let waitCountdown = $state(0);
	let waitTimerHandle = $state<ReturnType<typeof setInterval> | null>(null);

	// Condition gate state
	let awaitingCondition = $state(false);

	// Pause/resume state
	let paused = $state(false);

	// ETA tracking
	let stepStartTime = $state(0);
	let stepDurations = $state<number[]>([]);
	let etaMs = $state(0);

	// ---- Custom workflow builder state ----
	let showBuilder = $state(false);
	let builderName = $state('');
	let builderSteps = $state<Array<{ name: string; prompt: string; agentId: string }>>([]);
	let editingStep = $state<number | null>(null);
	let customWorkflows = $state<Workflow[]>([]);
	let draggingIdx = $state<number | null>(null);
	let dragOverIdx = $state<number | null>(null);

	const LS_KEY = 'hm-custom-workflows';

	onMount(() => {
		try {
			const raw = localStorage.getItem(LS_KEY);
			if (raw) customWorkflows = JSON.parse(raw) as Workflow[];
		} catch {}

		const unlisten = listen<{ content: string }>('ai-chunk', ({ payload }) => {
			streamingContent += payload.content;
		});
		return () => { unlisten.then(fn => fn()); };
	});

	function saveCustomToStorage() {
		try { localStorage.setItem(LS_KEY, JSON.stringify(customWorkflows)); } catch {}
	}

	const allWorkflows = $derived([...WORKFLOWS, ...customWorkflows]);
	const selectedWorkflow = $derived(allWorkflows.find(w => w.id === selectedId) ?? WORKFLOWS[0]);

	function resolvedStepType(step: WorkflowStep): StepType {
		if (step.type) return step.type;
		if (step.humanGate) return 'condition';
		return 'prompt';
	}

	function stepIcon(step: WorkflowStep): string {
		const t = resolvedStepType(step);
		if (t === 'wait') return '⏱';
		if (t === 'condition') return '⚡';
		if (t === 'agent') return '⚙';
		return '▷';
	}

	function formatDelayLabel(step: WorkflowStep): string {
		const n = step.delay ?? 5;
		const unit = step.delayUnit ?? 'seconds';
		return `${n} ${unit}`;
	}

	function delayToSeconds(delay: number, unit: DelayUnit): number {
		if (unit === 'minutes') return delay * 60;
		if (unit === 'hours') return delay * 3600;
		return delay;
	}

	// ---- Wait timer helpers ----
	function clearWaitTimer() {
		if (waitTimerHandle !== null) {
			clearInterval(waitTimerHandle);
			waitTimerHandle = null;
		}
	}

	function startWaitTimer(seconds: number, onDone: () => void) {
		clearWaitTimer();
		waitCountdown = seconds;
		const handle = setInterval(() => {
			waitCountdown -= 1;
			if (waitCountdown <= 0) {
				clearWaitTimer();
				onDone();
			}
		}, 1000);
		waitTimerHandle = handle;
	}

	// ---- Builder actions ----
	function openBuilder() {
		builderName = '';
		builderSteps = [];
		editingStep = null;
		showBuilder = true;
	}

	function cancelBuilder() {
		showBuilder = false;
		builderName = '';
		builderSteps = [];
		editingStep = null;
	}

	function addStep() {
		builderSteps = [...builderSteps, { name: '', prompt: '', agentId: '' }];
		editingStep = builderSteps.length - 1;
	}

	function removeStep(i: number) {
		builderSteps = builderSteps.filter((_, idx) => idx !== i);
		if (editingStep === i) editingStep = null;
		else if (editingStep !== null && editingStep > i) editingStep--;
	}

	function reorderStep(from: number, to: number) {
		if (from === to) return;
		const copy = [...builderSteps];
		const [moved] = copy.splice(from, 1);
		copy.splice(to, 0, moved);
		builderSteps = copy;
		if (editingStep === from) editingStep = to;
		else if (editingStep !== null && from < to && editingStep > from && editingStep <= to) editingStep--;
		else if (editingStep !== null && from > to && editingStep >= to && editingStep < from) editingStep++;
	}

	function moveStep(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= builderSteps.length) return;
		const copy = [...builderSteps];
		[copy[i], copy[j]] = [copy[j], copy[i]];
		builderSteps = copy;
		if (editingStep === i) editingStep = j;
		else if (editingStep === j) editingStep = i;
	}

	function updateStepField<K extends keyof (typeof builderSteps)[number]>(i: number, key: K, val: (typeof builderSteps)[number][K]) {
		const copy = [...builderSteps];
		copy[i] = { ...copy[i], [key]: val };
		builderSteps = copy;
	}

	function saveBuilder() {
		const name = builderName.trim();
		if (!name || builderSteps.length === 0) return;
		const id = `custom-${Date.now()}`;
		const wf: Workflow = {
			id,
			name,
			description: `${builderSteps.length}-step custom workflow`,
			steps: builderSteps.map((s, i) => ({
				id: `s${i + 1}`,
				name: s.name || `Step ${i + 1}`,
				prompt: s.prompt,
				agentId: s.agentId || undefined,
				type: s.agentId ? 'agent' : 'prompt',
			})),
		};
		customWorkflows = [...customWorkflows, wf];
		saveCustomToStorage();
		cancelBuilder();
		selectedId = id;
	}

	function deleteCustomWorkflow(id: string) {
		customWorkflows = customWorkflows.filter(w => w.id !== id);
		saveCustomToStorage();
		if (selectedId === id) selectedId = WORKFLOWS[0].id;
	}

	function duplicateWorkflow(wf: Workflow) {
		const copy: Workflow = {
			...wf,
			id: `custom-${Date.now()}`,
			name: `${wf.name} (copy)`,
			steps: wf.steps.map(s => ({ ...s })),
		};
		customWorkflows = [...customWorkflows, copy];
		saveCustomToStorage();
	}

	// ---- Actions ----
	function close() {
		appState.workflowsOpen = false;
	}

	function selectWorkflow(id: string) {
		selectedId = id;
		showBuilder = false;
		wfState = { phase: 'idle' };
		taskInput = '';
		streamingContent = '';
		stepComplete = false;
		clearWaitTimer();
		awaitingCondition = false;
		paused = false;
		stepDurations = [];
		etaMs = 0;
	}

	function startSetup() {
		wfState = { phase: 'setup', workflowId: selectedId, taskDescription: '' };
		taskInput = '';
	}

	function formatEta(ms: number): string {
		const s = Math.ceil(ms / 1000);
		if (s < 60) return `~${s}s remaining`;
		return `~${Math.floor(s / 60)}m ${s % 60}s remaining`;
	}

	async function runWorkflow() {
		const task = taskInput.trim();
		if (!task) return;

		const wf = selectedWorkflow;
		const session = await api.createSession({ title: wf.name, project_path: appState.projectPath || undefined });
		appState.sessions = [session, ...appState.sessions];

		streamingContent = '';
		stepComplete = false;
		running = true;
		paused = false;
		clearWaitTimer();
		awaitingCondition = false;
		stepDurations = [];
		etaMs = 0;

		wfState = {
			phase: 'running',
			workflowId: wf.id,
			currentStep: 0,
			sessionId: session.id,
			stepOutputs: [],
		};

		const firstStep = wf.steps[0];
		try {
			await executeStep(session.id, 0, task, []);
		} catch (err) {
			if (firstStep?.skipOnFail) {
				streamingContent = `⚠ Skipped: ${firstStep.name}`;
				stepComplete = true;
				running = false;
			} else {
				throw err;
			}
		}
	}

	async function executeStep(sessionId: string, stepIndex: number, task: string, prevOutputs: string[]) {
		const wf = allWorkflows.find(w => w.id === selectedId) ?? WORKFLOWS[0];
		const step = wf.steps[stepIndex];
		const stype = resolvedStepType(step);

		streamingContent = '';
		stepComplete = false;
		running = true;
		clearWaitTimer();
		awaitingCondition = false;
		stepStartTime = Date.now();

		const outputs = [...prevOutputs];

		if (stype === 'wait') {
			const delay = delayToSeconds(step.delay ?? 5, step.delayUnit ?? 'seconds');
			running = false;
			startWaitTimer(delay, () => {
				stepComplete = true;
				if (stepIndex === wf.steps.length - 1) {
					wfState = { phase: 'done', workflowId: wf.id, sessionId };
				}
			});
			wfState = {
				phase: 'running',
				workflowId: wf.id,
				currentStep: stepIndex,
				sessionId,
				stepOutputs: outputs,
			};
			return;
		}

		if (stype === 'condition') {
			running = false;
			awaitingCondition = true;
			wfState = {
				phase: 'running',
				workflowId: wf.id,
				currentStep: stepIndex,
				sessionId,
				stepOutputs: outputs,
			};
			return;
		}

		// agent step or prompt step
		let content = `${step.prompt}\n\nTask: ${task}`;
		if (stype === 'agent' && step.agentId) {
			const agent = appState.agents?.find(a => a.id === step.agentId);
			if (agent) content = `[Using agent: ${agent.name}]\n${content}`;
		}
		try {
			await api.streamMessage(sessionId, content);
		} finally {
			running = false;
			stepComplete = true;
			const elapsed = Date.now() - stepStartTime;
			stepDurations = [...stepDurations, elapsed];
			const avg = stepDurations.reduce((a, b) => a + b, 0) / stepDurations.length;
			const stepsLeft = wf.steps.length - stepIndex - 1;
			etaMs = stepsLeft > 0 ? avg * stepsLeft : 0;
		}

		outputs.push(streamingContent);

		if (stepIndex === wf.steps.length - 1) {
			wfState = { phase: 'done', workflowId: wf.id, sessionId };
		} else {
			wfState = {
				phase: 'running',
				workflowId: wf.id,
				currentStep: stepIndex,
				sessionId,
				stepOutputs: outputs,
			};
		}
	}

	async function continueToNext() {
		if (wfState.phase !== 'running') return;
		const { sessionId, currentStep, stepOutputs, workflowId } = wfState;
		const wf = allWorkflows.find(w => w.id === workflowId) ?? WORKFLOWS[0];
		const nextStep = currentStep + 1;

		clearWaitTimer();
		awaitingCondition = false;
		stepComplete = false;

		while (paused) await new Promise(r => setTimeout(r, 200));

		wfState = {
			phase: 'running',
			workflowId,
			currentStep: nextStep,
			sessionId,
			stepOutputs,
		};

		const nextStepDef = wf.steps[nextStep];
		try {
			await executeStep(sessionId, nextStep, taskInput, stepOutputs);
		} catch (err) {
			if (nextStepDef?.skipOnFail) {
				streamingContent = `⚠ Skipped: ${nextStepDef.name}`;
				stepComplete = true;
				running = false;
			} else {
				throw err;
			}
		}
	}

	function skipToEnd() {
		if (wfState.phase !== 'running') return;
		const { sessionId, workflowId } = wfState;
		const wf = allWorkflows.find(w => w.id === workflowId) ?? WORKFLOWS[0];
		clearWaitTimer();
		awaitingCondition = false;
		wfState = { phase: 'done', workflowId, sessionId };
	}

	function openSession() {
		if (wfState.phase !== 'done') return;
		appState.activeSessionId = wfState.sessionId;
		appState.workflowsOpen = false;
	}

	function resetWorkflow() {
		clearWaitTimer();
		awaitingCondition = false;
		paused = false;
		wfState = { phase: 'idle' };
		taskInput = '';
		streamingContent = '';
		stepComplete = false;
		running = false;
		stepDurations = [];
		etaMs = 0;
	}
</script>

<button class="backdrop" aria-label="Close workflows" onclick={close}></button>

<div class="panel" role="dialog" aria-modal="true">
	<!-- Header -->
	<div class="panel-header">
		<span class="panel-title">Workflows</span>
		<div class="header-actions">
			<button class="close-btn" aria-label="Close" onclick={close}>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					<line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	</div>

	<div class="panel-body">
		<!-- Left column: workflow list -->
		<div class="template-list">
			{#each WORKFLOWS as wf (wf.id)}
				<button
					class="template-card"
					class:selected={selectedId === wf.id && !showBuilder}
					onclick={() => selectWorkflow(wf.id)}
				>
					<div class="template-name">{wf.name}</div>
					<div class="template-desc">{wf.description}</div>
					<div class="template-badge">{wf.steps.length} steps</div>
				</button>
			{/each}

			{#each customWorkflows as wf (wf.id)}
				<div class="template-card-wrap">
					<button
						class="template-card"
						class:selected={selectedId === wf.id && !showBuilder}
						onclick={() => selectWorkflow(wf.id)}
					>
						<div class="template-name-row">
							<span class="template-name">{wf.name}</span>
							<span class="badge-custom">Custom</span>
						</div>
						<div class="template-desc">{wf.description}</div>
						<div class="template-badge">{wf.steps.length} steps</div>
					</button>
					<button class="custom-action duplicate-custom" onclick={() => duplicateWorkflow(wf)} title="Duplicate workflow">⧉</button>
					<button class="custom-action delete-custom" onclick={() => deleteCustomWorkflow(wf.id)} title="Delete workflow">×</button>
				</div>
			{/each}

			<button class="btn-new-workflow" onclick={openBuilder}>＋ New workflow</button>
		</div>

		<!-- Right panel -->
		<div class="detail-panel">
			{#if showBuilder}
				<!-- Builder UI -->
				<div class="builder-header">
					<div class="wf-name">New workflow</div>
				</div>

				<div class="builder-name-row">
					<input
						class="builder-name-input"
						type="text"
						placeholder="Workflow name"
						bind:value={builderName}
					/>
				</div>

				<div class="steps-list">
					{#each builderSteps as step, i}
						<div
							class="step-row"
							class:step-current={editingStep === i}
							class:step-dragging={draggingIdx === i}
							class:step-drag-over={dragOverIdx === i && draggingIdx !== i}
							role="listitem"
							draggable="true"
							ondragstart={() => { draggingIdx = i; }}
							ondragover={(e) => { e.preventDefault(); dragOverIdx = i; }}
							ondrop={() => { if (draggingIdx !== null) { reorderStep(draggingIdx, i); } draggingIdx = null; dragOverIdx = null; }}
							ondragend={() => { draggingIdx = null; dragOverIdx = null; }}
						>
							<div class="drag-handle" title="Drag to reorder">⠿</div>
							<div class="step-num">{i + 1}</div>
							<div class="step-info">
								{#if editingStep === i}
									<input
										class="step-edit-input"
										type="text"
										placeholder="Step name"
										value={step.name}
										oninput={(e) => updateStepField(i, 'name', (e.currentTarget as HTMLInputElement).value)}
									/>
									<div class="step-delay-row">
										<label class="step-type-label" for="step-agent-{i}">Agent</label>
										<select
											id="step-agent-{i}"
											class="step-type-select"
											value={step.agentId}
											onchange={(e) => updateStepField(i, 'agentId', (e.currentTarget as HTMLSelectElement).value)}
										>
											<option value="">— none —</option>
											{#each (appState.agents ?? []) as agent (agent.id)}
												<option value={agent.id}>{agent.name}</option>
											{/each}
										</select>
									</div>
									<textarea
										class="step-edit-textarea"
										placeholder="Step prompt"
										value={step.prompt}
										oninput={(e) => updateStepField(i, 'prompt', (e.currentTarget as HTMLTextAreaElement).value)}
									></textarea>
								{:else}
									<button class="step-expand-btn" onclick={() => { editingStep = i; }}>
										<div class="step-name-row-inner">
											<span class="step-icon">▷</span>
											<span class="step-name">{step.name || 'Untitled step'}</span>
											{#if step.agentId}
												{@const ag = (appState.agents ?? []).find(a => a.id === step.agentId)}
												{#if ag}<span class="step-type-badge">{ag.name}</span>{/if}
											{/if}
										</div>
										{#if step.prompt}
											<div class="step-preview">{step.prompt.slice(0, 80)}{step.prompt.length > 80 ? '…' : ''}</div>
										{/if}
									</button>
								{/if}
							</div>
							<div class="step-actions">
								<button class="step-action-btn" onclick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">△</button>
								<button class="step-action-btn" onclick={() => moveStep(i, 1)} disabled={i === builderSteps.length - 1} title="Move down">▽</button>
								<button class="step-action-btn step-action-delete" onclick={() => removeStep(i)} title="Delete">×</button>
							</div>
						</div>
					{/each}
				</div>

				<button class="btn-add-step" onclick={addStep}>+ Add step</button>

				<div class="builder-actions">
					<button class="btn-ghost" onclick={cancelBuilder}>Cancel</button>
					<button class="btn-primary" onclick={saveBuilder} disabled={!builderName.trim() || builderSteps.length === 0}>Save</button>
				</div>

			{:else if wfState.phase === 'idle' || wfState.phase === 'setup'}
				<div class="wf-header">
					<div class="wf-name">{selectedWorkflow.name}</div>
					<div class="wf-desc">{selectedWorkflow.description}</div>
				</div>

				<div class="steps-list">
					{#each selectedWorkflow.steps as step, i}
						<div class="step-row">
							<div class="step-num">{i + 1}</div>
							<div class="step-info">
								<div class="step-name-row-inner">
									<span class="step-icon">{stepIcon(step)}</span>
									<span class="step-name">{step.name}</span>
									{#if resolvedStepType(step) === 'wait'}<span class="step-type-badge">Wait {formatDelayLabel(step)}</span>{/if}
									{#if resolvedStepType(step) === 'condition'}<span class="step-type-badge">If: {step.condition || 'condition'}</span>{/if}
									{#if resolvedStepType(step) === 'agent' && step.agentId}
										{@const ag = (appState.agents ?? []).find(a => a.id === step.agentId)}
										{#if ag}<span class="step-type-badge">{ag.name}</span>{/if}
									{/if}
								</div>
								{#if resolvedStepType(step) !== 'wait' && resolvedStepType(step) !== 'condition'}
									<div class="step-preview">{step.prompt.slice(0, 80)}{step.prompt.length > 80 ? '…' : ''}</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				{#if wfState.phase === 'idle'}
					<div class="start-area">
						<button class="btn-primary" onclick={startSetup}>Start workflow</button>
					</div>
				{:else}
					<div class="task-area">
						<label class="task-label" for="task-input">Describe your task</label>
						<textarea
							id="task-input"
							class="task-textarea"
							placeholder="What do you want to work on?"
							bind:value={taskInput}
						></textarea>
						<div class="task-actions">
							<button class="btn-ghost" onclick={resetWorkflow}>Cancel</button>
							<button class="btn-primary" onclick={runWorkflow} disabled={!taskInput.trim()}>Run</button>
						</div>
					</div>
				{/if}

			{:else if wfState.phase === 'running'}
				{@const runningState = wfState as { phase: 'running'; workflowId: string; currentStep: number; sessionId: string; stepOutputs: string[] }}
				{@const wf = allWorkflows.find(w => w.id === runningState.workflowId) ?? WORKFLOWS[0]}
				{@const cs = runningState.currentStep}

				<div class="wf-header">
					<div class="wf-name">{wf.name}</div>
					<div class="run-meta-row">
						<span class="wf-desc">Step {cs + 1} of {wf.steps.length}</span>
						{#if paused}
							<span class="badge-paused">Paused</span>
						{/if}
						{#if etaMs > 0 && !paused}
							<span class="eta-label">{formatEta(etaMs)}</span>
						{/if}
					</div>
					<div class="progress-track">
						<div
							class="progress-fill"
							style="width: {((cs + 1) / wf.steps.length) * 100}%"
						></div>
					</div>
				</div>

				<div class="run-controls">
					<button
						class="btn-ghost-sm"
						onclick={() => { paused = !paused; }}
					>{paused ? 'Resume' : 'Pause'}</button>
					<button class="btn-ghost-sm btn-stop" onclick={skipToEnd}>Stop</button>
				</div>

				<div class="steps-list">
					{#each wf.steps as step, i}
						{@const stype = resolvedStepType(step)}
						<div class="step-row" class:step-current={i === cs} class:step-done={i < cs}>
							<div class="step-num" class:step-num-done={i < cs} class:step-num-current={i === cs} class:step-num-future={i > cs}>
								{#if i < cs}
									✓
								{:else if i === cs}
									<span class="step-spin"></span>
								{:else}
									○
								{/if}
							</div>
							<div class="step-info">
								<div class="step-name-row-inner">
									<span class="step-icon">{stepIcon(step)}</span>
									<span class="step-name">{step.name}</span>
									{#if stype === 'wait' && i !== cs}<span class="step-type-badge">Wait {formatDelayLabel(step)}</span>{/if}
									{#if stype === 'condition' && i !== cs}<span class="step-type-badge">If: {step.condition || 'condition'}</span>{/if}
									{#if stype === 'agent' && step.agentId}
										{@const ag = (appState.agents ?? []).find(a => a.id === step.agentId)}
										{#if ag}<span class="step-type-badge">{i === cs ? `Using agent: ${ag.name}` : ag.name}</span>{/if}
									{/if}
								</div>

								{#if i === cs}
									{#if stype === 'wait'}
										<div class="wait-block">
											{#if waitTimerHandle !== null}
												<div class="wait-progress">
													<span class="wait-label">⏱ Waiting {waitCountdown}s...</span>
													<div class="wait-bar-track">
														<div
															class="wait-bar-fill"
															style="width: {Math.max(0, (waitCountdown / delayToSeconds(step.delay ?? 5, step.delayUnit ?? 'seconds')) * 100)}%"
														></div>
													</div>
												</div>
												<button class="btn-skip-wait" onclick={() => { clearWaitTimer(); stepComplete = true; }}>Skip</button>
											{:else if stepComplete}
												<span class="wait-label wait-done">Wait complete</span>
												{#if cs < wf.steps.length - 1}
													<button class="btn-continue" onclick={continueToNext}>
														Continue to {wf.steps[cs + 1].name} →
													</button>
												{/if}
											{/if}
										</div>

									{:else if stype === 'condition'}
										<div class="condition-block">
											<div class="condition-question">⚡ {step.condition || 'Ready to continue?'}</div>
											{#if awaitingCondition}
												<div class="condition-actions">
													<button class="btn-continue" onclick={continueToNext}>Continue</button>
													<button class="btn-ghost-sm" onclick={skipToEnd}>Skip to end</button>
												</div>
											{/if}
										</div>

									{:else}
										<div class="step-streaming">
											{#if running}
												<span class="streaming-text">{streamingContent || ''}</span>
												<span class="cursor-blink">▋</span>
											{:else if stepComplete}
												<span class="streaming-text">{streamingContent}</span>
											{/if}
										</div>
										{#if stepComplete && !running && cs < wf.steps.length - 1}
											<button class="btn-continue" onclick={continueToNext}>
												Continue to {wf.steps[cs + 1].name} →
											</button>
										{/if}
									{/if}
								{/if}
							</div>
						</div>
					{/each}
				</div>

			{:else if wfState.phase === 'done'}
				{@const doneState = wfState as { phase: 'done'; workflowId: string; sessionId: string }}
				{@const wf = allWorkflows.find(w => w.id === doneState.workflowId) ?? WORKFLOWS[0]}
				<div class="done-screen">
					<div class="done-icon">✓</div>
					<div class="done-title">Workflow complete</div>
					<div class="done-sub">{wf.name} finished across {wf.steps.length} steps.</div>
					<div class="done-actions">
						<button class="btn-ghost" onclick={resetWorkflow}>Run again</button>
						<button class="btn-primary" onclick={openSession}>Open session</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
.backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	z-index: 200;
}

.panel {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 700px;
	max-height: 80vh;
	background: var(--bg-panel);
	border: 1px solid var(--border-mid);
	border-radius: var(--radius-xl);
	box-shadow: var(--shadow-overlay);
	z-index: 201;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	animation: panel-in 150ms ease;
	isolation: isolate;
}

@keyframes panel-in {
	from { opacity: 0; transform: translate(-50%, -48%); }
	to { opacity: 1; transform: translate(-50%, -50%); }
}

.panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 44px;
	padding: 0 16px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}

.panel-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--text);
	letter-spacing: -0.01em;
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
.close-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

.header-actions {
	display: flex;
	align-items: center;
	gap: 4px;
}

.panel-body {
	display: flex;
	flex: 1;
	overflow: hidden;
}

/* Left column */
.template-list {
	width: 240px;
	min-width: 240px;
	border-right: 1px solid var(--border);
	overflow-y: auto;
	padding: 8px 6px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.template-card-wrap {
	position: relative;
	display: flex;
	align-items: stretch;
}

.custom-action {
	position: absolute;
	width: 18px;
	height: 18px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	font-size: 13px;
	color: var(--text-muted);
	opacity: 0;
	transition: opacity var(--transition), background var(--transition), color var(--transition);
}
.template-card-wrap:hover .custom-action { opacity: 1; }
.custom-action:hover { background: var(--bg-hover); color: var(--text-secondary); }
.delete-custom { right: 6px; top: 8px; }
.duplicate-custom { right: 28px; top: 8px; }
.delete-custom:hover { color: var(--red); }

.template-card-wrap .template-card {
	flex: 1;
	padding-right: 54px;
}

.template-card {
	width: 100%;
	padding: 10px 10px;
	border-radius: var(--radius-md);
	border: 1px solid transparent;
	text-align: left;
	transition: background var(--transition), border-color var(--transition);
	display: flex;
	flex-direction: column;
	gap: 3px;
}
.template-card:hover { background: var(--bg-hover); }
.template-card.selected {
	background: var(--bg-active);
	border-color: var(--accent);
}

.template-name-row {
	display: flex;
	align-items: center;
	gap: 6px;
}

.template-name {
	font-size: 12px;
	font-weight: 600;
	color: var(--text);
}
.template-desc {
	font-size: 11px;
	color: var(--text-muted);
	line-height: 1.4;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.template-badge {
	margin-top: 4px;
	font-size: 10px;
	color: var(--accent);
	background: var(--accent-dim);
	padding: 1px 6px;
	border-radius: var(--radius-sm);
	width: fit-content;
}

.badge-custom {
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted);
	background: var(--bg-elevated);
	border: 1px solid var(--stroke-secondary);
	padding: 1px 5px;
	border-radius: var(--radius-sm);
}

.btn-new-workflow {
	margin-top: 6px;
	padding: 8px 10px;
	border-radius: var(--radius-md);
	border: 1px dashed var(--stroke-secondary);
	text-align: left;
	font-size: 11px;
	color: var(--text-muted);
	transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.btn-new-workflow:hover {
	border-color: var(--accent);
	color: var(--accent);
	background: var(--accent-dim);
}

/* Right panel */
.detail-panel {
	flex: 1;
	overflow-y: auto;
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.wf-header { display: flex; flex-direction: column; gap: 4px; }
.wf-name { font-size: 15px; font-weight: 600; color: var(--text); }
.wf-desc { font-size: 12px; color: var(--text-muted); }

/* Builder */
.builder-header { display: flex; flex-direction: column; gap: 4px; }

.builder-name-row {
	display: flex;
}

.builder-name-input {
	flex: 1;
	padding: 7px 10px;
	border-radius: var(--radius-md);
	border: 1px solid var(--border-mid);
	background: var(--bg-elevated);
	color: var(--text);
	font-size: 13px;
	outline: none;
	transition: border-color var(--transition);
}
.builder-name-input:focus { border-color: var(--accent); }

.step-expand-btn {
	width: 100%;
	text-align: left;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.step-name-row-inner {
	display: flex;
	align-items: center;
	gap: 5px;
}

.step-icon {
	font-size: 11px;
	flex-shrink: 0;
}

.step-type-badge {
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted);
	background: var(--bg-elevated);
	border: 1px solid var(--stroke-secondary);
	padding: 1px 5px;
	border-radius: var(--radius-sm);
}

.step-type-label {
	font-size: 11px;
	color: var(--text-muted);
	flex-shrink: 0;
}

.step-type-select {
	padding: 4px 8px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--border-mid);
	background: var(--bg-elevated);
	color: var(--text);
	font-size: 11px;
	outline: none;
	transition: border-color var(--transition);
}
.step-type-select:focus { border-color: var(--accent); }

.step-delay-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.step-edit-input {
	width: 100%;
	padding: 5px 8px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--border-mid);
	background: var(--bg-elevated);
	color: var(--text);
	font-size: 12px;
	outline: none;
	margin-bottom: 4px;
	transition: border-color var(--transition);
}
.step-edit-input:focus { border-color: var(--accent); }

.step-edit-textarea {
	width: 100%;
	min-height: 64px;
	resize: vertical;
	padding: 5px 8px;
	border-radius: var(--radius-sm);
	border: 1px solid var(--border-mid);
	background: var(--bg-elevated);
	color: var(--text);
	font-size: 11px;
	line-height: 1.5;
	font-family: inherit;
	outline: none;
	transition: border-color var(--transition);
}
.step-edit-textarea:focus { border-color: var(--accent); }

.step-actions {
	display: flex;
	flex-direction: column;
	gap: 2px;
	flex-shrink: 0;
}

.step-action-btn {
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-sm);
	font-size: 11px;
	color: var(--text-muted);
	transition: background var(--transition), color var(--transition);
}
.step-action-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.step-action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.step-action-delete:hover { color: var(--red); }

.btn-add-step {
	padding: 6px 12px;
	border-radius: var(--radius-md);
	border: 1px dashed var(--stroke-secondary);
	font-size: 11px;
	color: var(--text-muted);
	width: fit-content;
	transition: border-color var(--transition), color var(--transition);
}
.btn-add-step:hover { border-color: var(--accent); color: var(--accent); }

.builder-actions {
	display: flex;
	gap: 8px;
	justify-content: flex-end;
	margin-top: auto;
}

/* Steps */
.steps-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.step-row {
	display: flex;
	gap: 12px;
	padding: 10px 12px;
	border-radius: var(--radius-md);
	border: 1px solid var(--border);
	transition: border-color var(--transition);
}
.step-row.step-current {
	border-color: var(--accent);
	background: color-mix(in srgb, var(--accent) 5%, transparent);
}
.step-row.step-done {
	opacity: 0.6;
}
.step-row.step-dragging {
	opacity: 0.4;
}
.step-row.step-drag-over {
	border-top: 2px solid var(--accent);
}

.drag-handle {
	flex-shrink: 0;
	font-size: 14px;
	color: var(--text-muted);
	cursor: grab;
	line-height: 1;
	padding: 2px 2px 0;
	user-select: none;
	opacity: 0;
	transition: opacity var(--transition);
}
.step-row:hover .drag-handle { opacity: 1; }
.drag-handle:active { cursor: grabbing; }

.step-num {
	width: 22px;
	height: 22px;
	border-radius: 50%;
	background: var(--bg-elevated);
	border: 1px solid var(--stroke-secondary);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 10px;
	font-weight: 600;
	color: var(--text-secondary);
	flex-shrink: 0;
}
.step-num-done {
	background: var(--green);
	border-color: var(--green);
	color: #fff;
}
.step-num-current {
	background: var(--accent);
	border-color: var(--accent);
	color: #fff;
}
.step-num-future {
	color: var(--text-muted);
	border-color: var(--stroke-secondary);
	background: transparent;
	font-size: 10px;
}

.step-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.step-name { font-size: 12px; font-weight: 600; color: var(--text); }
.step-preview { font-size: 11px; color: var(--text-muted); }

/* Wait block */
.wait-block {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 4px;
}

.wait-progress {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wait-bar-track {
	width: 100%;
	height: 3px;
	background: var(--bg-hover);
	border-radius: 2px;
	overflow: hidden;
}

.wait-bar-fill {
	height: 100%;
	background: var(--accent);
	border-radius: 2px;
	transition: width 0.9s linear;
}

.wait-label {
	font-size: 12px;
	color: var(--text-secondary);
}

.wait-done {
	color: var(--green);
}

.btn-skip-wait {
	padding: 4px 10px;
	border-radius: var(--radius-md);
	border: 1px solid var(--stroke-secondary);
	color: var(--text-muted);
	font-size: 11px;
	width: fit-content;
	transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.btn-skip-wait:hover { background: var(--bg-hover); border-color: var(--stroke-primary); color: var(--text-secondary); }

/* Condition block */
.condition-block {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-top: 4px;
}

.condition-question {
	font-size: 12px;
	color: var(--text-secondary);
	line-height: 1.5;
}

.condition-actions {
	display: flex;
	gap: 8px;
}

.btn-ghost-sm {
	padding: 4px 10px;
	border-radius: var(--radius-md);
	border: 1px solid var(--stroke-secondary);
	color: var(--text-muted);
	font-size: 11px;
	transition: background var(--transition), border-color var(--transition);
}
.btn-ghost-sm:hover { background: var(--bg-hover); border-color: var(--stroke-primary); }

/* Streaming */
.step-streaming {
	font-size: 12px;
	color: var(--text-secondary);
	line-height: 1.6;
	max-height: 200px;
	overflow-y: auto;
	white-space: pre-wrap;
	word-break: break-word;
}
.streaming-text { white-space: pre-wrap; }
.cursor-blink {
	display: inline-block;
	animation: blink 1s step-end infinite;
	color: var(--accent);
}
@keyframes blink {
	0%, 100% { opacity: 1; }
	50% { opacity: 0; }
}

.btn-continue {
	margin-top: 10px;
	padding: 6px 14px;
	border-radius: var(--radius-md);
	border: 1px solid var(--accent);
	background: var(--accent-dim);
	color: var(--accent);
	font-size: 12px;
	font-weight: 500;
	transition: background var(--transition);
	width: fit-content;
}
.btn-continue:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }

/* Start / task area */
.start-area { margin-top: auto; }

.task-area {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: auto;
}
.task-label {
	font-size: 12px;
	color: var(--text-secondary);
	font-weight: 500;
}
.task-textarea {
	resize: vertical;
	min-height: 80px;
	padding: 8px 10px;
	border-radius: var(--radius-md);
	border: 1px solid var(--border-mid);
	background: var(--bg-elevated);
	color: var(--text);
	font-size: 13px;
	line-height: 1.5;
	font-family: inherit;
	outline: none;
	transition: border-color var(--transition);
}
.task-textarea:focus { border-color: var(--accent); }
.task-actions {
	display: flex;
	gap: 8px;
	justify-content: flex-end;
}

/* Done screen */
.done-screen {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 40px 20px;
}
.done-icon {
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--green) 15%, transparent);
	border: 1px solid var(--green);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 20px;
	color: var(--green);
}
.done-title {
	font-size: 16px;
	font-weight: 600;
	color: var(--text);
}
.done-sub {
	font-size: 12px;
	color: var(--text-muted);
}
.done-actions {
	display: flex;
	gap: 8px;
	margin-top: 8px;
}

/* Buttons */
.btn-primary {
	padding: 7px 16px;
	border-radius: var(--radius-md);
	background: var(--accent);
	color: #fff;
	font-size: 12px;
	font-weight: 500;
	transition: opacity var(--transition);
}
.btn-primary:hover { opacity: 0.88; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-ghost {
	padding: 7px 16px;
	border-radius: var(--radius-md);
	border: 1px solid var(--stroke-secondary);
	color: var(--text-secondary);
	font-size: 12px;
	transition: background var(--transition), border-color var(--transition);
}
.btn-ghost:hover { background: var(--bg-hover); border-color: var(--stroke-primary); }

/* Progress bar */
.progress-track {
	height: 3px;
	background: var(--bg-elevated);
	border-radius: 2px;
	overflow: hidden;
	margin-top: 8px;
}

.progress-fill {
	height: 100%;
	background: var(--accent);
	border-radius: 2px;
	transition: width 0.3s ease;
}

/* Run meta row */
.run-meta-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.badge-paused {
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--yellow);
	background: color-mix(in srgb, var(--yellow) 12%, transparent);
	border: 1px solid color-mix(in srgb, var(--yellow) 30%, transparent);
	padding: 1px 6px;
	border-radius: var(--radius-sm);
}

.eta-label {
	font-size: 11px;
	color: var(--text-muted);
}

/* Run controls row */
.run-controls {
	display: flex;
	gap: 8px;
}

.btn-stop:hover {
	color: var(--red);
	border-color: color-mix(in srgb, var(--red) 40%, transparent);
}

/* Step spin indicator */
.step-spin {
	display: block;
	width: 10px;
	height: 10px;
	border: 2px solid rgba(255,255,255,0.3);
	border-top-color: #fff;
	border-radius: 50%;
	animation: spin 0.7s linear infinite;
}

@keyframes spin {
	to { transform: rotate(360deg); }
}
</style>
