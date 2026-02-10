import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitResponse } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const SearchSchema = z.object({
  q: z.string().min(1).max(200),
  repoId: z.string().optional(),
  sectionType: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

interface SearchRow {
  id: string;
  repositoryId: string;
  scanId: string;
  sectionHeading: string;
  sectionType: string;
  chunkIndex: number;
  tokenCount: number;
  repoFullName: string;
  repoName: string;
  rank: number;
  snippet: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(session.user.id, "search", {
    max: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const parsed = SearchSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid search parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { q, repoId, sectionType, limit, offset } = parsed.data;

  // Build optional WHERE clauses
  const repoClause = repoId
    ? Prisma.sql`AND sc."repositoryId" = ${repoId}`
    : Prisma.empty;
  const sectionClause = sectionType
    ? Prisma.sql`AND sc."sectionType" = ${sectionType}`
    : Prisma.empty;

  const results = await db.$queryRaw<SearchRow[]>`
    SELECT
      sc.id,
      sc."repositoryId",
      sc."scanId",
      sc."sectionHeading",
      sc."sectionType",
      sc."chunkIndex",
      sc."tokenCount",
      r."fullName" AS "repoFullName",
      r."name" AS "repoName",
      ts_rank(sc."searchVector", plainto_tsquery('english', ${q})) AS rank,
      ts_headline(
        'english',
        sc."content",
        plainto_tsquery('english', ${q}),
        'StartSel=**,StopSel=**,MaxWords=60,MinWords=20,MaxFragments=2'
      ) AS snippet
    FROM "SearchChunk" sc
    JOIN "Repository" r ON r.id = sc."repositoryId"
    WHERE r."userId" = ${session.user.id}
      AND (
        sc."searchVector" @@ plainto_tsquery('english', ${q})
        OR sc."content" ILIKE '%' || ${q} || '%'
      )
      ${repoClause}
      ${sectionClause}
    ORDER BY rank DESC, sc."chunkIndex" ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const countResult = await db.$queryRaw<[{ total: number }]>`
    SELECT COUNT(*)::int AS total
    FROM "SearchChunk" sc
    JOIN "Repository" r ON r.id = sc."repositoryId"
    WHERE r."userId" = ${session.user.id}
      AND (
        sc."searchVector" @@ plainto_tsquery('english', ${q})
        OR sc."content" ILIKE '%' || ${q} || '%'
      )
      ${repoClause}
      ${sectionClause}
  `;

  return NextResponse.json({
    results,
    total: countResult[0]?.total ?? 0,
    query: q,
    limit,
    offset,
  });
}
