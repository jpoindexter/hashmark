/**
 * Section-aware markdown chunker for AGENTS.md content.
 * Standalone version for CLI/MCP usage — no Prisma dependency.
 *
 * Splits on heading boundaries (## and ###) rather than blind paragraphs,
 * preserving the document's semantic structure.
 */

export interface MarkdownChunk {
  id: string;
  heading: string;
  sectionType: string;
  content: string;
}

const MAX_CHUNK_CHARS = 2000;
const SPLIT_THRESHOLD_CHARS = 1500;

const SECTION_TYPE_MAP: Record<string, string> = {
  "tl;dr": "overview",
  "project overview": "overview",
  "getting started": "overview",
  "file tree": "overview",
  "critical rules": "rules",
  "additional guidelines": "rules",
  "framework-specific": "rules",
  components: "components",
  "component variants": "components",
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
  if (current.trim()) fragments.push(current.trim());
  return fragments.length > 0 ? fragments : [text];
}

/**
 * Chunk an AGENTS.md markdown string into searchable sections.
 */
export function chunkMarkdown(markdown: string): MarkdownChunk[] {
  if (!markdown.trim()) return [];

  const chunks: MarkdownChunk[] = [];
  let idx = 0;

  const h2Parts = markdown.split(/\n(?=## )/);

  for (const h2Part of h2Parts) {
    const h2Match = h2Part.match(/^## (.+)/);
    const h2Heading = h2Match ? h2Match[1].trim() : "Overview";
    const sectionType = classifySectionType(h2Heading);
    const h2Content = h2Match ? h2Part.slice(h2Part.indexOf("\n") + 1).trim() : h2Part.trim();

    if (!h2Content) continue;

    if (h2Content.length <= SPLIT_THRESHOLD_CHARS) {
      chunks.push({ id: `chunk-${idx++}`, heading: h2Heading, sectionType, content: h2Content });
      continue;
    }

    const h3Parts = h2Content.split(/\n(?=### )/);
    for (const h3Part of h3Parts) {
      const h3Match = h3Part.match(/^### (.+)/);
      const heading = h3Match ? `${h2Heading} > ${h3Match[1].trim()}` : h2Heading;
      const h3Content = h3Match ? h3Part.slice(h3Part.indexOf("\n") + 1).trim() : h3Part.trim();

      if (!h3Content) continue;

      if (h3Content.length <= MAX_CHUNK_CHARS) {
        chunks.push({ id: `chunk-${idx++}`, heading, sectionType, content: h3Content });
        continue;
      }

      const fragments = splitOnParagraphs(h3Content, MAX_CHUNK_CHARS);
      for (const fragment of fragments) {
        chunks.push({ id: `chunk-${idx++}`, heading, sectionType, content: fragment });
      }
    }
  }

  return chunks;
}
