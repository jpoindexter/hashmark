import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recoverOrphanedScans } from "@/lib/scan-error";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { repoId } = await params;

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { id: true },
  });

  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Recover any scans stuck longer than 10 minutes (server restart, etc.)
  await recoverOrphanedScans();

  const scan = await db.scan.findFirst({
    where: { repositoryId: repoId },
    orderBy: { createdAt: "desc" },
  });

  if (!scan) {
    return NextResponse.json(null);
  }

  return NextResponse.json(scan);
}
