import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { getDb } from "./db.js";
import { loadProviders } from "./providers.js";
import { getOAuthApiKey } from "./oauth.js";
import { runAgentTurn } from "./harness.js";

export interface WorkflowStep {
  id: string;
  name?: string;
  prompt: string;
  model?: string;
  system_prompt?: string;
  depends_on?: string[];
  human_gate?: boolean;   // pause and wait for human approval before running
  timeout_ms?: number;    // kill the step after this many ms; default unlimited
  on_failure?: string;    // step id to run instead of halting on failure
}

export interface WorkflowDef {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  created_at: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "waiting" | "done" | "error" | "cancelled";
  stepResults: Record<string, { sessionId: string; status: "pending" | "running" | "done" | "error" | "waiting" }>;
  stepOutputs: Record<string, string>;  // step id -> artifact text (for $step_id.output refs)
  error?: string;
  created_at: number;
  updated_at: number;
}

// In-memory run registry -- sufficient for single-process server
const activeRuns = new Map<string, { abort: () => void; run: WorkflowRun }>();

export function listWorkflows(dataDir: string): WorkflowDef[] {
  const dir = join(dataDir, "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try { return JSON.parse(readFileSync(join(dir, f), "utf-8")) as WorkflowDef; } catch { return null; }
    })
    .filter(Boolean) as WorkflowDef[];
}

export function saveWorkflow(dataDir: string, def: WorkflowDef): void {
  const dir = join(dataDir, "workflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${def.id}.json`), JSON.stringify(def, null, 2), "utf-8");
}

export function deleteWorkflow(dataDir: string, id: string): void {
  const path = join(dataDir, "workflows", `${id}.json`);
  if (existsSync(path)) unlinkSync(path);
}

// ── Built-in workflow templates ────────────────────────────────────────────────

export const BUILTIN_WORKFLOWS: Omit<WorkflowDef, "id" | "created_at">[] = [
  {
    name: "PIV — Plan → Implement → Validate",
    description: "Dark factory loop: Plan the work, implement it, validate with tests, then open a PR. Uses GITHUB_EVENT_TITLE/BODY from GitHub adapter.",
    steps: [
      {
        id: "plan",
        name: "Plan",
        model: "claude-opus-4-6",
        prompt: `You are a software architect. A GitHub issue has been filed:\n\nTitle: {{env.GITHUB_EVENT_TITLE}}\n\nDescription:\n{{env.GITHUB_EVENT_BODY}}\n\nCreate a detailed implementation plan: what files to change, what the approach is, and acceptance criteria. Be specific and concise.`,
      },
      {
        id: "implement",
        name: "Implement",
        depends_on: ["plan"],
        prompt: `Implement the following plan:\n\n$plan.output\n\nWrite production-quality code. Do not add unnecessary comments or tests unless they are part of the plan. Commit your changes with a descriptive message using git.`,
      },
      {
        id: "validate",
        name: "Validate",
        depends_on: ["implement"],
        prompt: `Review the implementation summary:\n\n$implement.output\n\nAcceptance criteria from the plan:\n\n$plan.output\n\nRun the test suite if one exists. Report: PASS or FAIL with specific details.`,
      },
      {
        id: "pr",
        name: "Open PR",
        depends_on: ["validate"],
        human_gate: true,
        prompt: `The validation passed. Now open a pull request using the gh CLI.\n\nPlan summary:\n$plan.output\n\nPR title should reference the issue. Run: gh pr create --title "..." --body "..." --draft`,
      },
    ],
  },
  {
    name: "Release — Changelog → Tag → Publish",
    description: "Bump version, generate changelog from git log, create a git tag, and optionally publish.",
    steps: [
      {
        id: "changelog",
        name: "Generate Changelog",
        prompt: `Run git log --oneline --no-merges since the last tag (use git describe --tags --abbrev=0 to find it). Group commits by type (feat, fix, chore, etc.) and write a clean CHANGELOG entry for the new release. Determine what semver bump is appropriate (major/minor/patch) based on the commits. Write the changelog to CHANGELOG.md.`,
      },
      {
        id: "bump",
        name: "Bump Version",
        depends_on: ["changelog"],
        prompt: `Based on the changelog:\n\n$changelog.output\n\nUpdate the version number in package.json (or pyproject.toml / Cargo.toml, whichever applies). Commit the changelog and version bump with: git commit -m "chore: release v<version>"`,
      },
      {
        id: "tag",
        name: "Tag & Push",
        depends_on: ["bump"],
        human_gate: true,
        prompt: `Create a git tag for the new version and push it:\ngit tag v<version>\ngit push origin v<version>\n\nAlso push the release commit: git push origin HEAD`,
      },
    ],
  },
];

export function installBuiltin(dataDir: string, builtinIndex: number): WorkflowDef {
  const template = BUILTIN_WORKFLOWS[builtinIndex];
  if (!template) throw new Error(`No builtin at index ${builtinIndex}`);
  const def: WorkflowDef = { ...template, id: randomUUID(), created_at: Date.now() };
  saveWorkflow(dataDir, def);
  return def;
}

export function getWorkflowRun(runId: string): WorkflowRun | undefined {
  return activeRuns.get(runId)?.run;
}

export function listWorkflowRuns(): WorkflowRun[] {
  return [...activeRuns.values()].map(v => v.run);
}

export function cancelWorkflowRun(runId: string): void {
  activeRuns.get(runId)?.abort();
}

// Resolve {{stepId.session_id}}, @artifact:{{stepId.session_id}}, $step_id.output, and {{env.VAR}} template vars
function resolvePrompt(prompt: string, run: WorkflowRun, env: Record<string, string> = {}): string {
  return prompt
    .replace(/\{\{(\w+)\.session_id\}\}/g, (_, stepId) => run.stepResults[stepId]?.sessionId ?? `[unknown:${stepId}]`)
    .replace(/\$(\w+)\.output/g, (_, stepId) => run.stepOutputs[stepId] ?? `[no output from ${stepId}]`)
    .replace(/\{\{env\.([A-Z_]+)\}\}/g, (_, varName) => env[varName] ?? process.env[varName] ?? "");
}

function saveCheckpoint(dataDir: string, run: WorkflowRun): void {
  try {
    const dir = join(dataDir, "checkpoints");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${run.id}.json`), JSON.stringify(run, null, 2), "utf-8");
  } catch {}
}

export function loadCheckpoint(dataDir: string, runId: string): WorkflowRun | null {
  const path = join(dataDir, "checkpoints", `${runId}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")) as WorkflowRun; } catch { return null; }
}

export async function startWorkflowRun(opts: {
  workflowId: string;
  dataDir: string;
  projectDir: string;
  env?: Record<string, string>;
  onUpdate?: (run: WorkflowRun) => void;
  onHumanGate?: (runId: string, stepId: string) => Promise<boolean>;
}): Promise<WorkflowRun> {
  const { dataDir, projectDir } = opts;
  const envOverrides = opts.env ?? {};
  const workflowPath = join(dataDir, "workflows", `${opts.workflowId}.json`);
  if (!existsSync(workflowPath)) throw new Error(`Workflow not found: ${opts.workflowId}`);
  const def = JSON.parse(readFileSync(workflowPath, "utf-8")) as WorkflowDef;

  const run: WorkflowRun = {
    id: randomUUID(),
    workflowId: opts.workflowId,
    status: "running",
    stepResults: {},
    stepOutputs: {},
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  for (const step of def.steps) {
    run.stepResults[step.id] = { sessionId: "", status: "pending" };
  }

  let aborted = false;
  activeRuns.set(run.id, {
    abort: () => { aborted = true; run.status = "cancelled"; run.updated_at = Date.now(); },
    run,
  });

  // Run steps serially, respecting depends_on order
  const runAsync = async () => {
    const db = getDb(dataDir);
    const providers = loadProviders(dataDir);
    const provider = providers.active;
    let apiKey: string | undefined;
    if (provider === "claude") {
      apiKey = (await getOAuthApiKey()) ?? process.env.ANTHROPIC_API_KEY ?? undefined;
    } else {
      const pConfig = providers.providers.find(p => p.id === provider);
      apiKey = pConfig?.apiKey ?? process.env[`${provider.toUpperCase()}_API_KEY`] ?? undefined;
    }
    if (!apiKey) { run.status = "error"; run.error = "No API key"; activeRuns.delete(run.id); return; }

    // Topological order: steps with no unmet depends_on go first
    const completed = new Set<string>();
    const stepMap = new Map(def.steps.map(s => [s.id, s]));
    const queue = [...def.steps];

    while (queue.length > 0 && !aborted) {
      // Find next runnable step
      const idx = queue.findIndex(s => (s.depends_on ?? []).every(d => completed.has(d)));
      if (idx === -1) { run.status = "error"; run.error = "Dependency cycle or unresolvable depends_on"; break; }
      const step = queue.splice(idx, 1)[0];

      // Human gate: pause and wait
      if (step.human_gate && opts.onHumanGate) {
        run.stepResults[step.id].status = "waiting";
        run.status = "waiting";
        run.updated_at = Date.now();
        opts.onUpdate?.(run);
        const approved = await opts.onHumanGate(run.id, step.id);
        if (!approved || aborted) { run.status = "cancelled"; break; }
        run.status = "running";
      }

      // Create session for this step
      const sessionId = randomUUID();
      const now = Date.now();
      const prompt = resolvePrompt(step.prompt, run, envOverrides);
      const model = step.model ?? providers.model;
      db.prepare(
        "INSERT INTO sessions (id, title, model, provider, system_prompt, project_dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)"
      ).run(sessionId, step.name ?? step.id, model, provider, step.system_prompt ?? null, projectDir, now, now);

      run.stepResults[step.id] = { sessionId, status: "running" };
      run.updated_at = Date.now();
      opts.onUpdate?.(run);

      // Per-step timeout via AbortController
      const stepAbort = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      if (step.timeout_ms) {
        timeoutHandle = setTimeout(() => stepAbort.abort(new Error(`Step "${step.id}" timed out after ${step.timeout_ms}ms`)), step.timeout_ms);
      }

      let stepFailed = false;
      try {
        await runAgentTurn({
          sessionId, message: prompt,
          model,
          apiKey: apiKey!,
          provider,
          baseUrl: providers.providers.find(p => p.id === provider)?.baseUrl,
          systemPrompt: step.system_prompt ?? "",
          projectDir,
          dataDir,
          signal: stepAbort.signal,
          send: (data) => {
            if (data.type === "done") {
              const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
              db.prepare("UPDATE sessions SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, status = 'idle', updated_at = ? WHERE id = ?")
                .run(usage?.input_tokens ?? 0, usage?.output_tokens ?? 0, Date.now(), sessionId);
            }
          },
        });
        if (timeoutHandle) clearTimeout(timeoutHandle);

        // Capture step output for downstream $step_id.output refs
        const artifactPath = join(dataDir, "artifacts", sessionId, "output.md");
        if (existsSync(artifactPath)) {
          run.stepOutputs[step.id] = readFileSync(artifactPath, "utf-8");
        }
        run.stepResults[step.id].status = "done";
        completed.add(step.id);
      } catch (err) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        run.stepResults[step.id].status = "error";
        stepFailed = true;

        // Conditional edge: route to on_failure step instead of halting
        if (step.on_failure && stepMap.has(step.on_failure)) {
          const failStep = stepMap.get(step.on_failure)!;
          if (!queue.includes(failStep)) queue.unshift(failStep);
        } else {
          run.status = "error";
          run.error = err instanceof Error ? err.message : String(err);
          break;
        }
      }

      run.updated_at = Date.now();
      saveCheckpoint(dataDir, run);
      if (!stepFailed) opts.onUpdate?.(run);
    }

    if (!aborted && run.status === "running") run.status = "done";
    run.updated_at = Date.now();
    opts.onUpdate?.(run);
    // Keep completed runs in memory for 1 hour for status polling
    setTimeout(() => activeRuns.delete(run.id), 60 * 60 * 1000);
  };

  void runAsync();
  return run;
}
