import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { createTwoFilesPatch } from "diff";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { repoId } = await params;
  const { searchParams } = new URL(request.url);
  const fromScanId = searchParams.get("from");
  const toScanId   = searchParams.get("to");

  if (!fromScanId || !toScanId) {
    return NextResponse.json({ error: "from and to scan IDs are required" }, { status: 400 });
  }

  // Verify repo ownership
  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { id: true },
  });
  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch both scans and verify they belong to this repo
  const [fromScan, toScan] = await Promise.all([
    db.scan.findUnique({
      where: { id: fromScanId, repositoryId: repoId },
      select: { id: true, createdAt: true, generatedFiles: { select: { fileName: true, content: true } } },
    }),
    db.scan.findUnique({
      where: { id: toScanId, repositoryId: repoId },
      select: { id: true, createdAt: true, generatedFiles: { select: { fileName: true, content: true } } },
    }),
  ]);

  if (!fromScan || !toScan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Build a map of fileName → content for each scan
  const fromFiles = new Map(fromScan.generatedFiles.map(f => [f.fileName, f.content]));
  const toFiles   = new Map(toScan.generatedFiles.map(f => [f.fileName, f.content]));

  // Union of all file names across both scans
  const allFileNames = [...new Set([...fromFiles.keys(), ...toFiles.keys()])];

  // Generate unified patches for each file
  const patches = allFileNames.map(fileName => {
    const oldContent = fromFiles.get(fileName) ?? "";
    const newContent = toFiles.get(fileName)   ?? "";
    if (oldContent === newContent) return null;

    const patch = createTwoFilesPatch(
      `a/${fileName}`,
      `b/${fileName}`,
      oldContent,
      newContent,
      fromScan.createdAt.toISOString(),
      toScan.createdAt.toISOString(),
      { context: 4 }
    );
    return { fileName, patch };
  }).filter(Boolean) as { fileName: string; patch: string }[];

  return NextResponse.json({
    fromScanId,
    toScanId,
    fromDate: fromScan.createdAt.toISOString(),
    toDate:   toScan.createdAt.toISOString(),
    patches,
  });
}
