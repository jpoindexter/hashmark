import { db } from "./db";
import { chunkAgentsMd } from "./search-chunker";

/**
 * Index a completed scan's AGENTS.md content for full-text search.
 *
 * Replaces all existing chunks for the repository (only the latest
 * scan is searchable). The Postgres trigger auto-populates the
 * tsvector column on insert.
 */
export async function indexScanForSearch(
  scanId: string,
  repositoryId: string
): Promise<void> {
  const agentsMd = await db.generatedFile.findFirst({
    where: { scanId, format: "AGENTS_MD" },
    select: { content: true },
  });

  if (!agentsMd?.content) return;

  // Delete old chunks for this repo — only latest scan is searchable
  await db.searchChunk.deleteMany({ where: { repositoryId } });

  const chunks = chunkAgentsMd(agentsMd.content);
  if (chunks.length === 0) return;

  await db.searchChunk.createMany({
    data: chunks.map((chunk) => ({
      repositoryId,
      scanId,
      sectionHeading: chunk.sectionHeading,
      sectionType: chunk.sectionType,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      tokenCount: chunk.tokenCount,
    })),
  });
}
