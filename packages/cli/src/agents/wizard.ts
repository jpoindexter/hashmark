/**
 * Agents Wizard
 *
 * Interactive @clack/prompts flow for `hashmark agents`.
 * Asks company type, project name, and API key.
 */

import * as p from "@clack/prompts";
import { COMPANY_PRESETS, type AgentRole } from "./company-types.js";
import { ALL_TEMPLATES, DEPARTMENTS, type Department } from "./role-templates.js";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const KEY_CACHE_PATH = join(homedir(), ".hashmark", "anthropic-key");

function loadCachedKey(): string | null {
  try {
    if (existsSync(KEY_CACHE_PATH)) return readFileSync(KEY_CACHE_PATH, "utf-8").trim();
  } catch {}
  return null;
}

function cacheKey(key: string) {
  try {
    mkdirSync(join(homedir(), ".hashmark"), { recursive: true });
    writeFileSync(KEY_CACHE_PATH, key, { mode: 0o600 });
  } catch {}
}

export interface WizardResult {
  projectName: string;
  roles: AgentRole[];
  providerConfig: import("./ai-generator.js").ProviderConfig;
}

export async function runAgentsWizard(detectedProjectName: string): Promise<WizardResult | null> {
  p.intro("  hashmark agents");

  // Project name
  const projectName = await p.text({
    message: "Project name:",
    placeholder: detectedProjectName,
    defaultValue: detectedProjectName,
  });
  if (p.isCancel(projectName)) { p.cancel("Cancelled."); return null; }

  // Company type
  const companyType = await p.select({
    message: "What type of company is this?",
    options: COMPANY_PRESETS.map(preset => ({
      value: preset.id,
      label: preset.label,
      hint: preset.hint,
    })),
  });
  if (p.isCancel(companyType)) { p.cancel("Cancelled."); return null; }

  let roles: AgentRole[] = [];

  if (companyType === "custom") {
    // Custom: pick departments then roles
    const selectedDepts = await p.multiselect<Department>({
      message: "Which departments?",
      options: DEPARTMENTS.map(d => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) })),
      initialValues: ["engineering", "product"] as Department[],
      required: true,
    });
    if (p.isCancel(selectedDepts)) { p.cancel("Cancelled."); return null; }

    // Build roles from selected departments using the template registry
    for (const dept of selectedDepts as Department[]) {
      const deptTemplates = ALL_TEMPLATES.filter(t => t.department === dept);
      for (const t of deptTemplates) {
        roles.push({ id: t.id, title: t.id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()), description: "", department: dept });
      }
    }
  } else {
    const preset = COMPANY_PRESETS.find(p => p.id === companyType)!;
    roles = preset.roles;
    p.note(`${roles.length} agents across ${[...new Set(roles.map(r => r.department))].length} departments`, "Selected");
  }

  // Provider selection — auto-detect from env first
  const aiGen = await import("./ai-generator.js");
  const { detectProviderFromEnv, PROVIDER_LABELS } = aiGen;
  type ProviderKey = import("./ai-generator.js").ProviderKey;
  type ProviderConfig = import("./ai-generator.js").ProviderConfig;

  let providerConfig: ProviderConfig | null = detectProviderFromEnv();

  if (providerConfig) {
    const { label } = PROVIDER_LABELS[providerConfig.provider];
    p.note(`Using ${label} (detected from environment)`, "AI Provider");
  } else {
    // No env key found — ask user to pick a provider
    const providerKeys = Object.keys(PROVIDER_LABELS) as ProviderKey[];
    const selectedProvider = await p.select<ProviderKey>({
      message: "Which AI provider?",
      options: providerKeys.map(k => ({
        value: k,
        label: PROVIDER_LABELS[k].label,
        hint: PROVIDER_LABELS[k].hint,
      })),
    });
    if (p.isCancel(selectedProvider)) { p.cancel("Cancelled."); return null; }

    const chosen = selectedProvider as ProviderKey;
    const envVar = PROVIDER_LABELS[chosen].envVar;

    let baseURL: string | undefined;
    if (chosen === "openai-compatible") {
      const url = await p.text({
        message: "Base URL (e.g. http://localhost:11434/v1 for Ollama):",
        placeholder: "http://localhost:11434/v1",
      });
      if (p.isCancel(url)) { p.cancel("Cancelled."); return null; }
      baseURL = url as string;
    }

    const keyInput = await p.password({
      message: `${PROVIDER_LABELS[chosen].label} API key (set ${envVar} to skip this next time):`,
      validate: (v) => (v ?? "").length > 10 ? undefined : "Key too short",
    });
    if (p.isCancel(keyInput)) { p.cancel("Cancelled."); return null; }

    const apiKey = keyInput as string;
    // Cache as the provider-specific env var name for next time
    cacheKey(`${chosen}:${apiKey}`);
    p.note(`Set ${envVar}=<key> to skip this prompt`, "Tip");

    providerConfig = { provider: chosen, apiKey, baseURL };
  }

  return { projectName: projectName as string, roles, providerConfig };
}
