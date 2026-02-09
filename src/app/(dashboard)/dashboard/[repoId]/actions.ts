"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken } from "@/lib/github";
import { revalidatePath } from "next/cache";

export async function triggerRepoScan(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
  });
  if (!repo) throw new Error("Repository not found");

  const scan = await db.scan.create({
    data: {
      repositoryId: repoId,
      status: "PENDING",
    },
  });

  const token = await getGitHubToken(session.user.id);
  runScanInBackground(scan.id, repo.fullName, token).catch(console.error);

  revalidatePath(`/dashboard/${repoId}`);
}

async function runScanInBackground(
  scanId: string,
  _fullName: string,
  _token: string
) {
  try {
    await db.scan.update({
      where: { id: scanId },
      data: { status: "SCANNING" },
    });

    // TODO: Clone repo, run CLI scanner, store results
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        duration: 3000,
        // Placeholder results
        results: {
          components: [],
          apiRoutes: [],
          complexity: [],
          scanners: [],
        },
        fileCount: 0,
        lineCount: 0,
        componentCount: 0,
        apiRouteCount: 0,
        modelCount: 0,
      },
    });
  } catch (error) {
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}
