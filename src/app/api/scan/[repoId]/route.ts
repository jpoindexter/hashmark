import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken } from "@/lib/github";
import { rateLimitResponse } from "@/lib/rate-limit";
import { runScan } from "@/lib/scan-worker";
import { NextResponse } from "next/server";

// 10 scans per user per 10 minutes
const SCAN_LIMIT = { max: 10, windowSeconds: 600 };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by user
  const limited = await rateLimitResponse(session.user.id, "scan-trigger", SCAN_LIMIT);
  if (limited) return limited;

  const { repoId } = await params;

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
  });
  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prevent duplicate scans
  const activeScan = await db.scan.findFirst({
    where: { repositoryId: repoId, status: { in: ["PENDING", "SCANNING"] } },
  });
  if (activeScan) {
    return NextResponse.json({ error: "Scan already in progress" }, { status: 409 });
  }

  const scan = await db.scan.create({
    data: {
      repositoryId: repoId,
      status: "PENDING",
    },
  });

  // Fire-and-forget: kick off background scan
  const token = await getGitHubToken(session.user.id);
  runScan(scan.id, repo.fullName, token, repo.scanRoot).catch(console.error);

  return NextResponse.json({ scanId: scan.id }, { status: 202 });
}
