import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitResponse } from "@/lib/rate-limit";
import { buildZip } from "@/lib/zip";
import { NextResponse } from "next/server";

// 30 downloads per user per 10 minutes
const DOWNLOAD_LIMIT = { max: 30, windowSeconds: 600 };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by user
  const limited = rateLimitResponse(session.user.id, "download", DOWNLOAD_LIMIT);
  if (limited) return limited;

  const { repoId } = await params;

  // Verify ownership
  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { fullName: true },
  });
  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get files from latest completed scan
  const latestScan = await db.scan.findFirst({
    where: { repositoryId: repoId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { generatedFiles: true },
  });

  if (!latestScan || latestScan.generatedFiles.length === 0) {
    return NextResponse.json(
      { error: "No generated files found" },
      { status: 404 }
    );
  }

  const files = latestScan.generatedFiles.map((f) => ({
    name: f.fileName,
    data: new TextEncoder().encode(f.content),
  }));

  const zipBuffer = buildZip(files);
  const safeRepoName = repo.fullName.replace(/[^a-zA-Z0-9._-]/g, "-");

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="hashmark-${safeRepoName}.zip"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}
