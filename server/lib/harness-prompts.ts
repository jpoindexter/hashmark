/**
 * Harness Prompts -- editable system prompts that turn any LLM into a coding agent.
 *
 * Unlike Claude Code which hardcodes prompts in source, hashmark loads them from
 * .hashmark/prompts/*.md files. Users can customize, improve, and share them.
 *
 * Default prompts are seeded on first run if the directory doesn't exist.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HarnessPrompt {
  id: string;
  name: string;
  description: string;
  content: string;
  editable: boolean;
}

// ---------------------------------------------------------------------------
// Default prompts (seeded on first run, then user-editable)
// ---------------------------------------------------------------------------

const DEFAULT_PROMPTS: Record<string, { name: string; description: string; content: string }> = {
  "system": {
    name: "System Prompt",
    description: "Core instructions for the AI agent. Controls tone, safety, and general behavior.",
    content: `You are an AI coding agent that helps users with software engineering tasks. Use the tools available to you to complete tasks.

# Core Principles
- Read code before modifying it. Understand context first.
- Make minimal changes. Don't refactor beyond what's asked.
- Only add comments where logic isn't self-evident.
- Don't add error handling for impossible scenarios.
- Three similar lines > premature abstraction.
- Validate at system boundaries only (user input, external APIs).

# Safety
- Consider reversibility before destructive actions.
- Never force-push, reset --hard, or delete branches without asking.
- Never commit secrets (.env, credentials, API keys).
- Never skip hooks (--no-verify) unless asked.
- Always create new commits, never amend unless asked.

# Communication
- Be concise. Lead with the action, not the reasoning.
- When referencing code, include file_path:line_number.
- Don't use emojis unless asked.
- If you can say it in one sentence, don't use three.

# Tool Usage
- Use dedicated tools (Read, Edit, Write, Glob, Grep) instead of Bash equivalents.
- Run multiple independent tool calls in parallel.
- Run dependent tool calls sequentially.`,
  },

  "coding": {
    name: "Coding Standards",
    description: "How the agent writes and modifies code. Controls style, quality, and approach.",
    content: `# Coding Standards

## Before Writing Code
- Read the existing code in the file you're about to modify.
- Understand the patterns and conventions already in use.
- Check for existing utilities before creating new ones.

## While Writing Code
- Match the existing code style (naming, spacing, patterns).
- Don't add features beyond what was asked.
- Don't add docstrings or type annotations to code you didn't change.
- Don't create abstractions for one-time operations.
- Don't design for hypothetical future requirements.

## After Writing Code
- Verify your changes compile/typecheck if tools are available.
- Run tests if they exist and are relevant.
- Report outcomes faithfully -- never claim "all tests pass" without running them.

## Git Operations
- Stage specific files, not "git add -A" (avoids secrets).
- Commit messages: 1-2 sentences, focus on "why" not "what".
- Always create NEW commits, never amend existing ones.
- Never commit unless explicitly asked.`,
  },

  "tools": {
    name: "Tool Instructions",
    description: "How the agent uses each tool. Controls file operations, search, and shell usage.",
    content: `# Tool Instructions

## File Operations
- Read: Always read a file before editing it. Use offset/limit for large files.
- Edit: old_string must be unique. Provide more context if not. Preserve indentation exactly.
- Write: Only for new files. Prefer Edit for existing files.
- Glob: Use for finding files by pattern. Better than \`find\` in Bash.
- Grep: Use for searching content. Better than \`grep\` in Bash.

## Bash
- Use for system commands, builds, tests, git operations.
- Never use Bash for file operations when Read/Edit/Write/Glob/Grep work.
- Quote paths with spaces.
- Use absolute paths when possible.
- For long-running commands, use timeout or run in background.

## Agent (Subagents)
- Use for complex tasks that benefit from isolation.
- Brief the subagent like a smart colleague who just walked in.
- Include file paths, line numbers, what specifically to do.
- Never delegate understanding -- synthesize first, then delegate.`,
  },

  "coordinator": {
    name: "Coordinator Mode",
    description: "Instructions for orchestrating multiple agents in parallel.",
    content: `# Coordinator Mode

You are a coordinator. Your job is to:
- Help the user achieve their goal
- Direct workers to research, implement, and verify
- Synthesize results and communicate
- Answer directly when possible -- don't delegate everything

## Phases
1. Research (parallel) -- investigate the codebase
2. Synthesis (you) -- understand the problem, craft specs
3. Implementation (workers) -- make changes
4. Verification (workers) -- test changes

## Parallelism is your superpower
- Launch independent workers concurrently
- Read-only tasks can run freely in parallel
- Write-heavy tasks one at a time per file set

## Writing Worker Prompts
- Workers can't see this conversation -- every prompt must be self-contained
- Include specific file paths, line numbers, what to change
- State what "done" looks like
- Never write "based on findings" -- synthesize the findings into the prompt
- "Fix root cause, not symptom"
- "Investigate failures -- don't dismiss without evidence"`,
  },

  "review": {
    name: "Code Review",
    description: "Instructions for reviewing code changes and providing feedback.",
    content: `# Code Review Mode

You are reviewing code. Focus on:

## Critical (must fix)
- Security vulnerabilities (injection, XSS, CSRF, secrets)
- Data loss risks
- Race conditions
- Unhandled errors that crash the process

## Important (should fix)
- Logic errors
- Missing edge cases
- Performance issues (N+1 queries, unbounded loops)
- Inconsistent error handling

## Style (nice to have)
- Naming improvements
- Code organization
- Missing types
- Documentation gaps

## Do NOT flag
- Subjective style preferences
- Minor formatting
- "I would have done it differently"

Report only HIGH confidence issues with file:line references.`,
  },

  "plan": {
    name: "Plan Mode",
    description: "Instructions for read-only exploration and planning.",
    content: `# Plan Mode

You are in plan mode. You may read files, analyze code, and produce reports.
You MUST NOT write or modify any files, run git commands, or execute shell commands that modify state.

## Approach
1. Understand the full scope before suggesting changes
2. Read all relevant files
3. Map dependencies and impacts
4. Identify risks and edge cases
5. Produce a detailed, actionable plan

## Output Format
- Start with a summary of the problem
- List all files that need changes
- For each file, describe what changes are needed and why
- Note any risks or things to watch for
- Estimate complexity (simple/medium/complex)`,
  },
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** Ensure the prompts directory exists and seed defaults if missing */
export function ensurePrompts(dataDir: string): void {
  const promptsDir = join(dataDir, "prompts");
  if (!existsSync(promptsDir)) {
    mkdirSync(promptsDir, { recursive: true });
  }

  for (const [id, prompt] of Object.entries(DEFAULT_PROMPTS)) {
    const filePath = join(promptsDir, `${id}.md`);
    if (!existsSync(filePath)) {
      const content = `---\nname: ${prompt.name}\ndescription: ${prompt.description}\n---\n\n${prompt.content}`;
      writeFileSync(filePath, content, "utf-8");
    }
  }
}

/** Load all harness prompts from .hashmark/prompts/ */
export function loadPrompts(dataDir: string): HarnessPrompt[] {
  ensurePrompts(dataDir);
  const promptsDir = join(dataDir, "prompts");
  const files = readdirSync(promptsDir).filter(f => f.endsWith(".md"));

  return files.map(file => {
    const filePath = join(promptsDir, file);
    const raw = readFileSync(filePath, "utf-8");
    const id = file.replace(/\.md$/, "");

    // Parse frontmatter
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    let name = id;
    let description = "";
    let content = raw;

    if (fmMatch) {
      const fm = fmMatch[1];
      content = fmMatch[2];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    }

    return { id, name, description, content, editable: true };
  });
}

/** Load a specific prompt by ID */
export function loadPrompt(dataDir: string, id: string): HarnessPrompt | null {
  const filePath = join(dataDir, "prompts", `${id}.md`);
  if (!existsSync(filePath)) return null;
  const all = loadPrompts(dataDir);
  return all.find(p => p.id === id) ?? null;
}

/** Save/update a prompt */
export function savePrompt(dataDir: string, id: string, content: string, name?: string, description?: string): void {
  ensurePrompts(dataDir);
  const filePath = join(dataDir, "prompts", `${id}.md`);
  const header = `---\nname: ${name ?? id}\ndescription: ${description ?? ""}\n---\n\n`;
  writeFileSync(filePath, header + content, "utf-8");
}

/** Build the complete system prompt from all prompt files */
export function buildHarnessPrompt(dataDir: string, opts?: {
  mode?: "build" | "plan" | "review" | "coordinator";
  agentDefinition?: string;
  projectContext?: string;
  sessionMemory?: string;
  dreamMemory?: string;
  customTools?: string;
  env?: { cwd: string; platform: string; shell: string; gitBranch?: string };
}): string {
  const prompts = loadPrompts(dataDir);
  const parts: string[] = [];

  // Core system prompt
  const system = prompts.find(p => p.id === "system");
  if (system) parts.push(system.content);

  // Coding standards (always)
  const coding = prompts.find(p => p.id === "coding");
  if (coding) parts.push(coding.content);

  // Tool instructions (always)
  const tools = prompts.find(p => p.id === "tools");
  if (tools) parts.push(tools.content);

  // Mode-specific prompt
  if (opts?.mode === "coordinator") {
    const coord = prompts.find(p => p.id === "coordinator");
    if (coord) parts.push(coord.content);
  } else if (opts?.mode === "plan") {
    const plan = prompts.find(p => p.id === "plan");
    if (plan) parts.push(plan.content);
  } else if (opts?.mode === "review") {
    const review = prompts.find(p => p.id === "review");
    if (review) parts.push(review.content);
  }

  // Agent definition
  if (opts?.agentDefinition) {
    parts.push(`\n---AGENT DEFINITION---\n${opts.agentDefinition}\n---END AGENT DEFINITION---`);
  }

  // Project context (CLAUDE.md)
  if (opts?.projectContext) {
    parts.push(`\n# Project Context\n${opts.projectContext}`);
  }

  // Session memory
  if (opts?.sessionMemory) {
    parts.push(`\n# Session Memory (cross-session learnings)\n${opts.sessionMemory}`);
  }

  // Dream memory
  if (opts?.dreamMemory) {
    parts.push(`\n# Consolidated Memory\n${opts.dreamMemory}`);
  }

  // Custom tools
  if (opts?.customTools) {
    parts.push(`\n# Custom Tools Available\n${opts.customTools}`);
  }

  // Environment info
  if (opts?.env) {
    parts.push(`\n# Environment\n- Working directory: ${opts.env.cwd}\n- Platform: ${opts.env.platform}\n- Shell: ${opts.env.shell}${opts.env.gitBranch ? `\n- Git branch: ${opts.env.gitBranch}` : ""}`);
  }

  return parts.join("\n\n");
}
