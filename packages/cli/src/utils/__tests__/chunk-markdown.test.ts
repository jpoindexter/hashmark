import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "../chunk-markdown.js";

// ============================================================================
// Basic chunking
// ============================================================================

describe("chunkMarkdown", () => {
  it("returns empty array for empty input", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   ")).toEqual([]);
  });

  it("chunks a simple two-section document", () => {
    const md = `## Project Overview\nThis is the overview.\n\n## Components\nButton and Card.`;
    const chunks = chunkMarkdown(md);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe("Project Overview");
    expect(chunks[0].content).toBe("This is the overview.");
    expect(chunks[1].heading).toBe("Components");
    expect(chunks[1].content).toBe("Button and Card.");
  });

  it("assigns sequential ids", () => {
    const md = `## A\nContent A.\n\n## B\nContent B.\n\n## C\nContent C.`;
    const chunks = chunkMarkdown(md);

    expect(chunks.map((c) => c.id)).toEqual(["chunk-0", "chunk-1", "chunk-2"]);
  });

  it("handles content before any H2 heading", () => {
    const md = `# AGENTS.md\nSome preamble.\n\n## Components\nButton.`;
    const chunks = chunkMarkdown(md);

    const preamble = chunks.find((c) => c.heading === "Overview");
    expect(preamble).toBeDefined();
    expect(preamble!.content).toContain("preamble");
  });

  it("skips sections with empty content", () => {
    const md = `## Overview\n\n## Components\nHas content.`;
    const chunks = chunkMarkdown(md);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("Components");
  });
});

// ============================================================================
// Section type classification
// ============================================================================

describe("section type classification", () => {
  const cases: [string, string][] = [
    ["Project Overview", "overview"],
    ["TL;DR", "overview"],
    ["Critical Rules", "rules"],
    ["Components", "components"],
    ["Custom Hooks", "hooks"],
    ["Preferred Imports", "imports"],
    ["API Routes", "api_routes"],
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
      const md = `## ${heading}\nSome content.`;
      const chunks = chunkMarkdown(md);
      expect(chunks[0].sectionType).toBe(expectedType);
    });
  }

  it("defaults to 'overview' for unknown headings", () => {
    const md = `## Miscellaneous\nContent.`;
    const chunks = chunkMarkdown(md);
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
    const chunks = chunkMarkdown(md);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe("Components > Button");
    expect(chunks[1].heading).toBe("Components > Card");
  });

  it("preserves parent section type for sub-sections", () => {
    const longContent = "x".repeat(800);
    const md = `## API Routes\n### GET /users\n${longContent}\n\n### POST /users\n${longContent}`;
    const chunks = chunkMarkdown(md);

    expect(chunks.every((c) => c.sectionType === "api_routes")).toBe(true);
  });

  it("keeps small sections as single chunk even with H3 headings", () => {
    const md = `## Components\n### Button\nSmall.\n\n### Card\nAlso small.`;
    const chunks = chunkMarkdown(md);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("Components");
  });
});

// ============================================================================
// Paragraph splitting for oversized sub-sections
// ============================================================================

describe("paragraph splitting", () => {
  it("splits oversized sub-sections on paragraph boundaries", () => {
    const para = "y".repeat(600);
    const bigContent = `${para}\n\n${para}\n\n${para}\n\n${para}`;
    const md = `## Components\n### BigComponent\n${bigContent}`;
    const chunks = chunkMarkdown(md);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(2000);
    }
  });

  it("preserves heading path in paragraph-split chunks", () => {
    const para = "z".repeat(700);
    const bigContent = `${para}\n\n${para}\n\n${para}\n\n${para}`;
    const md = `## Database Models\n### User\n${bigContent}`;
    const chunks = chunkMarkdown(md);

    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Database Models > User");
      expect(chunk.sectionType).toBe("database");
    }
  });
});

// ============================================================================
// MarkdownChunk interface
// ============================================================================

describe("MarkdownChunk shape", () => {
  it("returns objects with id, heading, sectionType, content", () => {
    const md = `## Commands\nnpm run dev`;
    const chunks = chunkMarkdown(md);

    expect(chunks[0]).toHaveProperty("id");
    expect(chunks[0]).toHaveProperty("heading");
    expect(chunks[0]).toHaveProperty("sectionType");
    expect(chunks[0]).toHaveProperty("content");
    expect(Object.keys(chunks[0])).toHaveLength(4);
  });
});
