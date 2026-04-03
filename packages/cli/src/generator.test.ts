import { describe, it, expect } from "vitest";
import type { ScanResult } from "./types.js";
import { generateAgentsMd } from "./generator.js";
import { generateClaudeMd } from "./formats/claude-md.js";
import { generateCursorRules } from "./formats/cursor-rules.js";

// ---------------------------------------------------------------------------
// Minimal ScanResult fixture
// ---------------------------------------------------------------------------

const minimalScan: ScanResult = {
  components: [],
  tokens: { colors: {}, spacing: {}, radius: {}, fonts: [] },
  framework: { name: "Next.js", version: "14.0.0", language: "TypeScript", styling: "Tailwind CSS" },
  hooks: [],
  utilities: {
    hasCn: false,
    hasMode: false,
    hasShadcn: false,
    radixPackages: [],
    hasCva: false,
    customUtils: [],
  },
  commands: { custom: {} },
  existingContext: {
    hasClaudeMd: false,
    hasAgentsMd: false,
    hasAiFolder: false,
    aiFiles: [],
    hasCursorRules: false,
    hasWindsurfRules: false,
    hasClineRules: false,
    hasGeminiMd: false,
    hasCopilotInstructions: false,
    hasCursorMdc: false,
    cursorMdcFiles: [],
    allRules: [],
  },
  variants: [],
  apiRoutes: [],
  envVars: [],
  patterns: {
    hasReactHookForm: false,
    hasZod: false,
    hasZustand: false,
    hasRedux: false,
    hasTanstackQuery: false,
    hasTrpc: false,
    hasSwr: false,
    hasRadixSlot: false,
    hasForwardRef: false,
    hasVitest: true,
    hasJest: false,
    hasPlaywright: false,
    patterns: [],
  },
  database: null,
  stats: {
    totalFiles: 10,
    totalLines: 500,
    totalSize: 20000,
    largestFiles: [],
    filesByType: { ts: 8, tsx: 2 },
  },
  barrels: [],
  dependencies: [],
  latentHooks: [],
};

// ---------------------------------------------------------------------------
// AGENTS.md
// ---------------------------------------------------------------------------

describe("generateAgentsMd", () => {
  it("returns a non-empty string", () => {
    const out = generateAgentsMd(minimalScan);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("starts with # AGENTS.md header", () => {
    const out = generateAgentsMd(minimalScan);
    expect(out).toContain("# AGENTS.md");
  });

  it("includes the framework name", () => {
    const out = generateAgentsMd(minimalScan);
    expect(out).toContain("Next.js");
  });

  it("includes a TL;DR section", () => {
    const out = generateAgentsMd(minimalScan);
    expect(out).toContain("## TL;DR");
  });

  it("compact mode returns a string without error", () => {
    const out = generateAgentsMd(minimalScan, { compact: true });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("compact mode produces output no longer than full mode for rich scans", () => {
    const richScan: ScanResult = {
      ...minimalScan,
      tokens: {
        colors: { primary: "#3b82f6", secondary: "#6b7280", background: "#fff", foreground: "#000" },
        spacing: { sm: "0.5rem", md: "1rem", lg: "2rem" },
        radius: { sm: "0.25rem", md: "0.5rem" },
        fonts: ["Inter", "mono"],
      },
      components: Array.from({ length: 20 }, (_, i) => ({
        name: `Component${i}`,
        path: `src/components/Component${i}.tsx`,
        importPath: `@/components/Component${i}`,
        props: ["className", "children"],
        exports: [`Component${i}`],
      })),
    };
    const full = generateAgentsMd(richScan);
    const compact = generateAgentsMd(richScan, { compact: true });
    expect(compact.length).toBeLessThanOrEqual(full.length);
  });

  it("minimal mode produces significantly shorter output", () => {
    const full = generateAgentsMd(minimalScan);
    const minimal = generateAgentsMd(minimalScan, { minimal: true });
    expect(minimal.length).toBeLessThan(full.length * 0.8);
  });

  it("xml mode produces XML output", () => {
    const out = generateAgentsMd(minimalScan, { xml: true });
    expect(out).toMatch(/<[a-zA-Z]/);
  });

  it("does not include component section when components is empty", () => {
    const out = generateAgentsMd(minimalScan);
    expect(out).not.toContain("## Components");
  });

  it("includes component section when components exist", () => {
    const scanWithComponents: ScanResult = {
      ...minimalScan,
      components: [
        {
          name: "Button",
          path: "src/components/Button.tsx",
          importPath: "@/components/Button",
          exports: ["Button"],
        },
      ],
    };
    const out = generateAgentsMd(scanWithComponents);
    expect(out).toContain("Button");
  });
});

// ---------------------------------------------------------------------------
// CLAUDE.md
// ---------------------------------------------------------------------------

describe("generateClaudeMd", () => {
  it("returns a non-empty string", () => {
    const out = generateClaudeMd(minimalScan);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("starts with # CLAUDE.md header", () => {
    const out = generateClaudeMd(minimalScan);
    expect(out).toContain("# CLAUDE.md");
  });

  it("includes MWP layer comment", () => {
    const out = generateClaudeMd(minimalScan);
    expect(out).toContain("Model Workspace Protocol");
  });

  it("includes the detected framework", () => {
    const out = generateClaudeMd(minimalScan);
    expect(out).toContain("Next.js");
  });

  it("injects custom rules when provided", () => {
    const out = generateClaudeMd(minimalScan, ["Never use inline styles"]);
    expect(out).toContain("Never use inline styles");
  });
});

// ---------------------------------------------------------------------------
// .cursorrules
// ---------------------------------------------------------------------------

describe("generateCursorRules", () => {
  it("returns a non-empty string", () => {
    const out = generateCursorRules(minimalScan);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("includes a Project Rules header", () => {
    const out = generateCursorRules(minimalScan);
    expect(out).toContain("# Project Rules");
  });

  it("includes the detected framework", () => {
    const out = generateCursorRules(minimalScan);
    expect(out).toContain("Next.js");
  });

  it("includes custom rules when provided", () => {
    const out = generateCursorRules(minimalScan, ["Always write JSDoc"]);
    expect(out).toContain("Always write JSDoc");
  });

  it("includes a hashmark attribution", () => {
    const out = generateCursorRules(minimalScan);
    expect(out).toContain("hashmark");
  });
});
