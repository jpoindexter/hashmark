"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken } from "@/lib/github";
import { checkRateLimit } from "@/lib/rate-limit";
import { runScan } from "@/lib/scan-worker";
import { revalidatePath } from "next/cache";

export async function triggerRepoScan(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  // Rate limit scan triggers
  const rateCheck = checkRateLimit(session.user.id, "scan-trigger", { max: 10, windowSeconds: 600 });
  if (!rateCheck.allowed) throw new Error("Too many scan requests. Please wait before trying again.");

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
  });
  if (!repo) throw new Error("Repository not found");

  // Prevent duplicate scans
  const activeScan = await db.scan.findFirst({
    where: { repositoryId: repoId, status: { in: ["PENDING", "SCANNING"] } },
  });
  if (activeScan) throw new Error("A scan is already in progress for this repository.");

  const scan = await db.scan.create({
    data: {
      repositoryId: repoId,
      status: "PENDING",
    },
  });

  const token = await getGitHubToken(session.user.id);
  runScan(scan.id, repo.fullName, token).catch(console.error);

  revalidatePath(`/dashboard/${repoId}`);
}
