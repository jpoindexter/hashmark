/**
 * Section-aware markdown chunker for AGENTS.md content.
 *
 * Splits on heading boundaries (## and ###) rather than blind paragraphs,
 * preserving the document's semantic structure. Each chunk retains its
 * full heading path and classified section type for weighted search.
 */

export interface ChunkData {
  sectionHeading: string;
  sectionType: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

const MAX_CHUNK_CHARS = 2000;
const SPLIT_THRESHOLD_CHARS = 1500;

/** Map heading text (lowercased) to a section type for search filtering. */
const SECTION_TYPE_MAP: Record<string, string> = {
  "tl;dr": "overview",
  "project overview": "overview",
  "getting started": "overview",
  "file tree": "overview",
  "critical rules": "rules",
  "additional guidelines": "rules",
  "framework-specific": "rules",
  "user rules": "rules",
  components: "components",
  "component variants": "components",
  "component dependencies": "components",
  "potentially unused components": "components",
  "custom hooks": "hooks",
  "preferred imports": "imports",
  "most imported files": "imports",
  "key dependencies": "imports",
  "api routes": "api_routes",
  "graphql schemas": "api_routes",
  "database models": "database",
  "environment variables": "env_vars",
  "code patterns": "patterns",
  "design tokens": "design_tokens",
  commands: "commands",
  "ai assistant configuration": "complexity",
  "custom notes": "custom",
};

function classifySectionType(heading: string): string {
  const lower = heading.toLowerCase().trim();
  for (const [key, type] of Object.entries(SECTION_TYPE_MAP)) {
    if (lower.includes(key)) return type;
  }
  return "overview";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text on paragraph boundaries, keeping chunks under maxChars.
 * Returns an array of text fragments.
 */
function splitOnParagraphs(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const fragments: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 2 > maxChars && current.length > 0) {
      fragments.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + paragraph;
  }

  if (current.trim()) {
    fragments.push(current.trim());
  }

  return fragments.length > 0 ? fragments : [text];
}

/**
 * Chunk an AGENTS.md markdown string into searchable sections.
 *
 * 1. Split on `## ` (H2 headings) to get top-level sections.
 * 2. If a section is small enough, store as one chunk.
 * 3. If large, split on `### ` (H3 headings) into sub-chunks.
 * 4. If any sub-chunk is still too large, split on paragraph boundaries.
 */
export function chunkAgentsMd(markdown: string): ChunkData[] {
  if (!markdown.trim()) return [];

  const chunks: ChunkData[] = [];
  let chunkIndex = 0;

  // Split on H2 headings, keeping the heading text
  const h2Parts = markdown.split(/\n(?=## )/);

  for (const h2Part of h2Parts) {
    const h2Match = h2Part.match(/^## (.+)/);
    const h2Heading = h2Match ? h2Match[1].trim() : "Overview";
    const sectionType = classifySectionType(h2Heading);

    // Strip the leading heading line from content for cleaner chunks
    const h2Content = h2Match ? h2Part.slice(h2Part.indexOf("\n") + 1).trim() : h2Part.trim();

    if (!h2Content) continue;

    // Small section — single chunk
    if (h2Content.length <= SPLIT_THRESHOLD_CHARS) {
      chunks.push({
        sectionHeading: h2Heading,
        sectionType,
        content: h2Content,
        chunkIndex: chunkIndex++,
        tokenCount: estimateTokens(h2Content),
      });
      continue;
    }

    // Large section — split on H3 headings
    const h3Parts = h2Content.split(/\n(?=### )/);

    for (const h3Part of h3Parts) {
      const h3Match = h3Part.match(/^### (.+)/);
      const heading = h3Match ? `${h2Heading} > ${h3Match[1].trim()}` : h2Heading;
      const h3Content = h3Match ? h3Part.slice(h3Part.indexOf("\n") + 1).trim() : h3Part.trim();

      if (!h3Content) continue;

      // Sub-section fits in one chunk
      if (h3Content.length <= MAX_CHUNK_CHARS) {
        chunks.push({
          sectionHeading: heading,
          sectionType,
          content: h3Content,
          chunkIndex: chunkIndex++,
          tokenCount: estimateTokens(h3Content),
        });
        continue;
      }

      // Sub-section too large — split on paragraphs
      const fragments = splitOnParagraphs(h3Content, MAX_CHUNK_CHARS);
      for (const fragment of fragments) {
        chunks.push({
          sectionHeading: heading,
          sectionType,
          content: fragment,
          chunkIndex: chunkIndex++,
          tokenCount: estimateTokens(fragment),
        });
      }
    }
  }

  return chunks;
}
