import { describe, it, expect } from "vitest";
import { chunkAgentsMd } from "../search-chunker";

// ============================================================================
// Basic chunking
// ============================================================================

describe("chunkAgentsMd", () => {
  it("returns empty array for empty input", () => {
    expect(chunkAgentsMd("")).toEqual([]);
    expect(chunkAgentsMd("   ")).toEqual([]);
  });

  it("chunks a simple two-section document", () => {
    const md = `## Project Overview\nThis is the overview.\n\n## Components\nButton and Card components.`;
    const chunks = chunkAgentsMd(md);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].sectionHeading).toBe("Project Overview");
    expect(chunks[0].content).toBe("This is the overview.");
    expect(chunks[1].sectionHeading).toBe("Components");
    expect(chunks[1].content).toBe("Button and Card components.");
  });

  it("assigns sequential chunkIndex values", () => {
    const md = `## Overview\nA\n\n## Rules\nB\n\n## Commands\nC`;
    const chunks = chunkAgentsMd(md);

    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
  });

  it("estimates token count as ceil(length / 4)", () => {
    const md = `## Overview\n${"x".repeat(100)}`;
    const chunks = chunkAgentsMd(md);

    expect(chunks[0].tokenCount).toBe(Math.ceil(100 / 4));
  });

  it("handles content before any H2 heading", () => {
    const md = `# AGENTS.md\nSome preamble text.\n\n## Components\nButton.`;
    const chunks = chunkAgentsMd(md);

    // Preamble without ## gets heading "Overview"
    const preamble = chunks.find((c) => c.sectionHeading === "Overview");
    expect(preamble).toBeDefined();
    expect(preamble!.content).toContain("preamble");
  });

  it("skips sections with empty content", () => {
    const md = `## Overview\n\n## Components\nSome content here.`;
    const chunks = chunkAgentsMd(md);

    // "Overview" has no content after the heading line
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sectionHeading).toBe("Components");
  });
});

// ============================================================================
// Section type classification
// ============================================================================

describe("section type classification", () => {
  const cases: [string, string][] = [
    ["Project Overview", "overview"],
    ["TL;DR", "overview"],
    ["Getting Started", "overview"],
    ["File Tree", "overview"],
    ["Critical Rules", "rules"],
    ["Additional Guidelines", "rules"],
    ["Framework-Specific", "rules"],
    ["Components", "components"],
    ["Component Variants", "components"],
    ["Custom Hooks", "hooks"],
    ["Preferred Imports", "imports"],
    ["Most Imported Files", "imports"],
    ["Key Dependencies", "imports"],
    ["API Routes", "api_routes"],
    ["GraphQL Schemas", "api_routes"],
    ["Database Models", "database"],
    ["Environment Variables", "env_vars"],
    ["Code Patterns", "patterns"],
    ["Design Tokens", "design_tokens"],
    ["Commands", "commands"],
    ["AI Assistant Configuration", "complexity"],
    ["Custom Notes", "custom"],
  ];

  for (const [heading, expectedType] of cases) {
    it(`classifies "${heading}" as "${expectedType}"`, () => {
      const md = `## ${heading}\nSome content here.`;
      const chunks = chunkAgentsMd(md);
      expect(chunks[0].sectionType).toBe(expectedType);
    });
  }

  it("defaults to 'overview' for unknown headings", () => {
    const md = `## Some Random Section\nContent.`;
    const chunks = chunkAgentsMd(md);
    expect(chunks[0].sectionType).toBe("overview");
  });
});

// ============================================================================
// H3 sub-section splitting
// ============================================================================

describe("H3 sub-section splitting", () => {
  it("splits large sections on H3 headings", () => {
    const longContent = "x".repeat(800);
    const md = `## Components\n### Button\n${longContent}\n\n### Card\n${longContent}`;
    const chunks = chunkAgentsMd(md);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].sectionHeading).toBe("Components > Button");
    expect(chunks[1].sectionHeading).toBe("Components > Card");
  });

  it("preserves parent section type for sub-sections", () => {
    const longContent = "x".repeat(800);
    const md = `## API Routes\n### GET /users\n${longContent}\n\n### POST /users\n${longContent}`;
    const chunks = chunkAgentsMd(md);

    expect(chunks.every((c) => c.sectionType === "api_routes")).toBe(true);
  });

  it("keeps small sections as single chunk even with H3 headings", () => {
    const md = `## Components\n### Button\nSmall content.\n\n### Card\nAlso small.`;
    const chunks = chunkAgentsMd(md);

    // Total content is under SPLIT_THRESHOLD_CHARS, so one chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sectionHeading).toBe("Components");
  });
});

// ============================================================================
// Paragraph splitting for very large sub-sections
// ============================================================================

describe("paragraph splitting", () => {
  it("splits oversized sub-sections on paragraph boundaries", () => {
    // Create a sub-section with multiple paragraphs that exceed MAX_CHUNK_CHARS
    const para = "y".repeat(600);
    const bigContent = `${para}\n\n${para}\n\n${para}\n\n${para}`;
    // Total: 4 * 600 + 3 * 2 = 2406 chars (exceeds 2000)
    const md = `## Components\n### BigComponent\n${bigContent}`;
    const chunks = chunkAgentsMd(md);

    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should be under MAX_CHUNK_CHARS
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(2000);
    }
  });

  it("preserves heading path in paragraph-split chunks", () => {
    const para = "z".repeat(700);
    const bigContent = `${para}\n\n${para}\n\n${para}\n\n${para}`;
    const md = `## Database Models\n### User\n${bigContent}`;
    const chunks = chunkAgentsMd(md);

    for (const chunk of chunks) {
      expect(chunk.sectionHeading).toBe("Database Models > User");
      expect(chunk.sectionType).toBe("database");
    }
  });
});

// ============================================================================
// Realistic AGENTS.md input
// ============================================================================

describe("realistic input", () => {
  it("chunks a multi-section AGENTS.md correctly", () => {
    const md = [
      "## Project Overview",
      "**Stack**: Next.js • TypeScript • Tailwind CSS",
      "",
      "## Critical Rules",
      "- Always use semantic tokens",
      "- Never hardcode colors",
      "",
      "## Components",
      "- Button: primary actions",
      "- Card: content containers",
      "",
      "## API Routes",
      "- GET /api/users",
      "- POST /api/users",
      "",
      "## Database Models",
      "- User: id, name, email",
      "- Post: id, title, content",
      "",
      "## Commands",
      "```bash",
      "npm run dev",
      "npm run build",
      "```",
    ].join("\n");

    const chunks = chunkAgentsMd(md);
    const types = chunks.map((c) => c.sectionType);

    expect(types).toContain("overview");
    expect(types).toContain("rules");
    expect(types).toContain("components");
    expect(types).toContain("api_routes");
    expect(types).toContain("database");
    expect(types).toContain("commands");
    expect(chunks.length).toBe(6);
  });
});
