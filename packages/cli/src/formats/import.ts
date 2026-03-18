/**
 * hashmark import — competitor context file parsers
 *
 * Converts opencode (agents.md), cursor-rules (.cursorrules), and copilot
 * (copilot-instructions.md) formats into the 5-layer MWP structure used
 * by hashmark's CLAUDE.md output.
 *
 * @module formats/import
 */

export type ImportFormat = "opencode" | "cursor-rules" | "copilot" | "auto";

export interface ParsedContext {
  format: ImportFormat;
  sections: {
    identity?: string;
    orientation?: string;
    operations?: string;
    constraints?: string;
    knowledge?: string;
    other: Record<string, string>;
  };
  raw: string;
}

// ============================================================================
// Format detection
// ============================================================================

export function detectFormat(content: string, filename: string): ImportFormat {
  const lower = filename.toLowerCase();
  if (lower.includes("agents.md")) return "opencode";
  if (lower.endsWith(".cursorrules")) return "cursor-rules";
  if (lower.includes("copilot-instructions")) return "copilot";
  // Heuristic: opencode agents.md often has "## Agent:" role headers
  if (/^## Agent:/m.test(content)) return "opencode";
  return "auto";
}

// ============================================================================
// Section splitting helpers
// ============================================================================

/** Split markdown content on `## ` headers, returning a map of header -> body. */
function splitOnH2(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Split on lines that start with "## "
  const parts = content.split(/\n(?=## )/);
  for (const part of parts) {
    const headerMatch = part.match(/^## ([^\n]+)/);
    if (headerMatch) {
      const header = headerMatch[1].trim();
      const body = part.slice(headerMatch[0].length).trim();
      result[header] = body;
    } else if (part.trim()) {
      // Content before the first ## header
      result["__preamble__"] = part.trim();
    }
  }
  return result;
}

/**
 * Fuzzy-map a section header name to a MWP layer key.
 * Returns null if no confident match.
 */
function mapHeaderToLayer(header: string): keyof ParsedContext["sections"] | null {
  const h = header.toLowerCase();

  if (/^(overview|about|project|identity|who|what|description|intro|summary)/.test(h)) return "identity";
  if (/^(architecture|structure|orientation|layout|file|folder|directory|codebase|map|nav)/.test(h)) return "orientation";
  if (/^(dev|development|operations|ops|workflow|getting.?started|setup|install|running|build|deploy|commands|scripts)/.test(h)) return "operations";
  if (/^(rules|guidelines|constraints|standards|conventions|patterns|do.?not|never|always|forbidden|requirements|code.?style|style)/.test(h)) return "constraints";
  if (/^(notes|context|knowledge|reference|background|gotcha|tips|caveats|troubleshoot|faq|quirk|detail|api|database|env)/.test(h)) return "knowledge";

  return null;
}

// ============================================================================
// Per-format parsers
// ============================================================================

function parseOpencode(content: string): ParsedContext["sections"] {
  const sections: ParsedContext["sections"] = { other: {} };
  const headerMap = splitOnH2(content);

  for (const [header, body] of Object.entries(headerMap)) {
    if (header === "__preamble__") {
      sections.identity = sections.identity
        ? sections.identity + "\n\n" + body
        : body;
      continue;
    }

    const layer = mapHeaderToLayer(header);
    if (layer && layer !== "other") {
      const existing = sections[layer];
      sections[layer] = existing ? existing + "\n\n" + body : body;
    } else {
      sections.other[header] = body;
    }
  }

  return sections;
}

function parseCursorRules(content: string): ParsedContext["sections"] {
  return {
    identity: "# Context File\n> Imported from .cursorrules",
    constraints: content.trim(),
    other: {},
  };
}

function parseCopilot(content: string): ParsedContext["sections"] {
  // Same header-based approach as opencode
  return parseOpencode(content);
}

function parseAuto(content: string): ParsedContext["sections"] {
  return parseOpencode(content);
}

// ============================================================================
// Public API
// ============================================================================

export function parseContext(content: string, format: ImportFormat): ParsedContext {
  let sections: ParsedContext["sections"];

  switch (format) {
    case "opencode":
      sections = parseOpencode(content);
      break;
    case "cursor-rules":
      sections = parseCursorRules(content);
      break;
    case "copilot":
      sections = parseCopilot(content);
      break;
    case "auto":
    default:
      sections = parseAuto(content);
      break;
  }

  return { format, sections, raw: content };
}

export function convertToMwp(parsed: ParsedContext): string {
  const { format, sections } = parsed;
  const lines: string[] = [];

  lines.push("# CLAUDE.md");
  lines.push("");
  lines.push(`<!-- Imported from ${format} by hashmark import -->`);
  lines.push("<!--");
  lines.push(" 5-Layer Model Workspace Protocol (MWP) — arxiv 2603.16021");
  lines.push(" Layer 1: Identity   — what this project is");
  lines.push(" Layer 2: Orientation — file map, entry points, key files");
  lines.push(" Layer 3: Operations  — how to run, build, test");
  lines.push(" Layer 4: Constraints — what NOT to do, non-delegation zones");
  lines.push(" Layer 5: Knowledge   — hotspots, patterns, API surface");
  lines.push("-->");
  lines.push("");

  // Layer 1: Identity
  lines.push("## Identity");
  lines.push("");
  if (sections.identity) {
    lines.push(sections.identity);
  } else {
    lines.push("> _No identity section found in source file. Add project name, stack, and purpose here._");
  }
  lines.push("");

  // Layer 2: Orientation
  lines.push("## Orientation");
  lines.push("");
  if (sections.orientation) {
    lines.push(sections.orientation);
  } else {
    lines.push("> _No orientation section found. Add file map, entry points, and key architectural files here._");
  }
  lines.push("");

  // Layer 3: Operations
  lines.push("## Operations");
  lines.push("");
  if (sections.operations) {
    lines.push(sections.operations);
  } else {
    lines.push("> _No operations section found. Add dev, build, test, and deploy commands here._");
  }
  lines.push("");

  // Layer 4: Constraints
  lines.push("## Constraints");
  lines.push("");
  if (sections.constraints) {
    lines.push(sections.constraints);
  } else {
    lines.push("> _No constraints section found. Add rules, non-delegation zones, and hard limits here._");
  }
  lines.push("");

  // Layer 5: Knowledge
  lines.push("## Knowledge");
  lines.push("");
  if (sections.knowledge) {
    lines.push(sections.knowledge);
  } else {
    lines.push("> _No knowledge section found. Add complexity hotspots, known patterns, and API surface here._");
  }

  // Append unmapped sections under Knowledge
  const otherEntries = Object.entries(sections.other);
  if (otherEntries.length > 0) {
    lines.push("");
    lines.push("### Additional Sections");
    lines.push("");
    for (const [header, body] of otherEntries) {
      lines.push(`#### ${header}`);
      lines.push("");
      lines.push(body);
      lines.push("");
    }
  }

  lines.push("");
  return lines.join("\n");
}
