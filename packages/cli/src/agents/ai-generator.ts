/**
 * AI-Powered Agent Generator
 *
 * Uses the Vercel AI SDK to generate agent .md files from scan data.
 * Supports any provider: Claude, GPT, Gemini, and more.
 * Priority: hashmark cloud (logged in) → env var → user-provided key.
 */

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import type { ScanResult } from "../types.js";
import type { AgentRole } from "./company-types.js";

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

export type ProviderKey =
  | "anthropic"    // Claude (claude-sonnet-4.6, claude-opus-4.6)
  | "openai"       // GPT (gpt-5.4, o3, o4-mini)
  | "gemini"       // Google Gemini (gemini-2.0-flash, gemini-2.5-pro)
  | "xai"          // Grok (grok-3, grok-3-mini)
  | "mistral"      // Mistral (mistral-large-latest, codestral-latest)
  | "groq"         // Groq (llama-3.3-70b, deepseek-r1)
  | "openai-compatible"; // Ollama, Cursor, LM Studio, any OpenAI-compatible API

export interface ProviderConfig {
  provider: ProviderKey;
  apiKey: string;
  model?: string;
  baseURL?: string; // for openai-compatible providers
}

/** Best default model per provider */
// NOTE: This is a CLI tool — direct API keys are intentional here.
// The hashmark cloud path (hashmark login) routes through our backend instead.
// Vercel AI Gateway OIDC applies to our server-side code, not this CLI binary.
const DEFAULT_MODELS: Record<ProviderKey, string> = {
  anthropic:           "claude-sonnet-4.6",
  openai:              "gpt-5.4",
  gemini:              "gemini-2.0-flash",
  xai:                 "grok-3",
  mistral:             "mistral-large-latest",
  groq:                "llama-3.3-70b-versatile",
  "openai-compatible": "gpt-4o",
};

/** Human-readable labels for the wizard */
export const PROVIDER_LABELS: Record<ProviderKey, { label: string; hint: string; envVar: string }> = {
  anthropic:           { label: "Anthropic Claude",  hint: "claude-sonnet-4.6",          envVar: "ANTHROPIC_API_KEY" },
  openai:              { label: "OpenAI",             hint: "gpt-5.4, o3, o4-mini",        envVar: "OPENAI_API_KEY" },
  gemini:              { label: "Google Gemini",      hint: "gemini-2.0-flash",            envVar: "GOOGLE_AI_API_KEY" },
  xai:                 { label: "xAI Grok",           hint: "grok-3, grok-3-mini",         envVar: "XAI_API_KEY" },
  mistral:             { label: "Mistral",            hint: "mistral-large, codestral",    envVar: "MISTRAL_API_KEY" },
  groq:                { label: "Groq",               hint: "llama-3.3-70b, deepseek-r1",  envVar: "GROQ_API_KEY" },
  "openai-compatible": { label: "OpenAI-compatible",  hint: "Ollama, LM Studio, Cursor",   envVar: "OPENAI_API_KEY" },
};

/** Resolve a LanguageModel instance from provider config */
export function resolveModel(config: ProviderConfig): LanguageModel {
  const modelId = config.model || DEFAULT_MODELS[config.provider];
  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(modelId);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(modelId);
    case "xai":
      return createXai({ apiKey: config.apiKey })(modelId);
    case "mistral":
      return createMistral({ apiKey: config.apiKey })(modelId);
    case "groq":
      return createGroq({ apiKey: config.apiKey })(modelId);
    case "openai-compatible":
      return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })(modelId);
  }
}

/**
 * Auto-detect provider config from environment variables.
 * Checks in priority order: Anthropic → OpenAI → Gemini → xAI → Mistral → Groq.
 * Returns null if no keys found.
 */
export function detectProviderFromEnv(): ProviderConfig | null {
  const checks: [string | undefined, ProviderKey][] = [
    [process.env.ANTHROPIC_API_KEY,                                      "anthropic"],
    [process.env.OPENAI_API_KEY,                                         "openai"],
    [process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY, "gemini"],
    [process.env.XAI_API_KEY,                                            "xai"],
    [process.env.MISTRAL_API_KEY,                                        "mistral"],
    [process.env.GROQ_API_KEY,                                           "groq"],
  ];
  for (const [key, provider] of checks) {
    if (key) return { provider, apiKey: key };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scan summary builder
// ---------------------------------------------------------------------------

export function buildScanSummary(scan: ScanResult, projectName: string): string {
  const parts: string[] = [];

  parts.push(`Project: ${projectName}`);
  parts.push(`Stack: ${scan.framework?.name || "Unknown"} ${scan.framework?.version || ""} · ${scan.framework?.language || "TypeScript"}${scan.framework?.router ? ` · ${scan.framework.router}` : ""}${scan.framework?.styling ? ` · ${scan.framework.styling}` : ""}`);

  if (scan.stats) {
    parts.push(`Codebase: ${scan.stats.totalFiles} files, ${scan.stats.totalLines.toLocaleString()} lines`);
  }

  if (scan.components?.length) {
    const grouped: Record<string, string[]> = {};
    for (const c of scan.components) {
      const dir = c.path.split("/").slice(-2, -1)[0] || "root";
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(c.name);
    }
    parts.push(`Components (${scan.components.length}):`);
    for (const [dir, names] of Object.entries(grouped)) {
      parts.push(`  ${dir}: ${names.join(", ")}`);
    }
  }

  if (scan.apiRoutes?.length) {
    parts.push(`API Routes:`);
    for (const r of scan.apiRoutes.slice(0, 20)) {
      parts.push(`  ${r.methods.join(",")} ${r.path}${r.isProtected ? " [auth]" : ""}`);
    }
  }

  if (scan.database?.models?.length) {
    parts.push(`Database (${scan.database.provider}):`);
    for (const m of scan.database.models.slice(0, 15)) {
      parts.push(`  ${m.name}: ${m.fields.slice(0, 6).join(", ")}`);
    }
  }

  if (scan.importGraph?.hubFiles?.length) {
    parts.push(`High-impact files:`);
    for (const h of scan.importGraph.hubFiles.slice(0, 6)) {
      parts.push(`  ${h.file} (${h.importedByCount} dependents)`);
    }
  }

  if (scan.envVars?.length) {
    const names = scan.envVars.map(e => e.name);
    const integrations = [
      names.some(n => n.includes("AUTH") || n.includes("NEXTAUTH") || n.includes("CLERK")) && "Auth",
      names.some(n => n.includes("STRIPE")) && "Stripe billing",
      names.some(n => n.includes("ANTHROPIC") || n.includes("OPENAI") || n.includes("GEMINI")) && "AI/LLM",
      names.some(n => n.includes("RESEND") || n.includes("SENDGRID")) && "Email",
      names.some(n => n.includes("GITHUB")) && "GitHub",
    ].filter(Boolean);
    if (integrations.length) parts.push(`Integrations: ${integrations.join(", ")}`);
  }

  if (scan.testCoverage?.testFramework && scan.testCoverage.testFramework !== "none") {
    parts.push(`Testing: ${scan.testCoverage.testFramework}`);
  }

  const cmds = scan.commands;
  if (cmds) {
    const cmdList = [
      cmds.dev && `dev: npm run dev`,
      cmds.build && `build: npm run build`,
      cmds.test && `test: npm test`,
      cmds.lint && `lint: npm run lint`,
    ].filter(Boolean);
    if (cmdList.length) parts.push(`Commands: ${cmdList.join(", ")}`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Agent generation
// ---------------------------------------------------------------------------

const AGENT_SYSTEM_PROMPT = `You write Claude Code subagent definition files. These are .md files that Claude Code uses to spin up specialized AI agents.

Rules:
- YAML frontmatter with name and description fields
- description must be specific and actionable — it's how Claude Code decides which agent to use
- Include only sections relevant to this role
- Engineering agents: include specific file paths, component names, API routes from the scan data
- Non-engineering agents: infer the product context from the scan (what the product does, who uses it, business model) and make the agent genuinely useful for that specific business
- Concrete standards, not platitudes
- Under 400 words — concise beats comprehensive
- Output raw markdown only`;

async function generateOneAgent(
  model: LanguageModel,
  role: AgentRole,
  scanSummary: string,
  projectName: string,
): Promise<string> {
  const { text } = await generateText({
    model,
    system: AGENT_SYSTEM_PROMPT,
    prompt: `Write a Claude Code subagent file for this role:

## Project Scan
${scanSummary}

## Role
Title: ${role.title}
Department: ${role.department}
Purpose: ${role.description}

Write the .md file for the ${role.title} at ${projectName}. Make it specific to this actual project, not generic.`,
  });

  // Strip outer code fences if the model wrapped the output
  return text.replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "").trim();
}

/**
 * Generate all agents in parallel batches of 5.
 */
export async function generateAgentsWithAI(
  scan: ScanResult,
  roles: AgentRole[],
  projectName: string,
  providerConfig: ProviderConfig,
  onProgress?: (roleTitle: string, done: number, total: number) => void,
): Promise<{ role: AgentRole; path: string; content: string }[]> {
  const model = resolveModel(providerConfig);
  const scanSummary = buildScanSummary(scan, projectName);
  const results: { role: AgentRole; path: string; content: string }[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < roles.length; i += BATCH_SIZE) {
    const batch = roles.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (role) => {
        const content = await generateOneAgent(model, role, scanSummary, projectName);
        results.push({ role, path: `${role.department}/${role.id}.md`, content });
        onProgress?.(role.title, results.length, roles.length);
        return { role, path: `${role.department}/${role.id}.md`, content };
      })
    );

    // batchResults already pushed above via closure
    void batchResults;
  }

  return results;
}

/**
 * Generate INDEX.md — real company overview from Claude.
 */
export async function generateIndexWithAI(
  agents: { role: AgentRole; path: string; content: string }[],
  projectName: string,
  scanSummary: string,
  providerConfig: ProviderConfig,
): Promise<string> {
  const model = resolveModel(providerConfig);
  const agentList = agents
    .map(a => `- ${a.role.title} (${a.role.department}): ${a.role.description}`)
    .join("\n");

  const { text } = await generateText({
    model,
    system: "You write concise, useful INDEX.md files for .claude/agents/ directories.",
    prompt: `Write an INDEX.md for the .claude/agents/ directory.

Project: ${projectName}
${scanSummary}

Agents:
${agentList}

Include:
1. One-line description of what ${projectName} is (infer from scan data)
2. Agents grouped by department with one-line descriptions
3. How Claude Code auto-selects agents
4. How to manually invoke: "use the X agent to..."

Raw markdown only.`,
  });

  return text.trim();
}
