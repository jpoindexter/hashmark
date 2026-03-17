"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken } from "@/lib/github";
import { checkRateLimit } from "@/lib/rate-limit";
import { runScan } from "@/lib/scan-worker";
import { revalidatePath } from "next/cache";

export async function connectRepo(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const githubRepoId = Number(formData.get("githubRepoId"));
  const name = formData.get("name") as string;
  const fullName = formData.get("fullName") as string;
  const defaultBranch = (formData.get("defaultBranch") as string) || "main";
  const isPrivate = formData.get("private") === "true";
  const language = formData.get("language") as string | null;
  const description = formData.get("description") as string | null;

  if (!githubRepoId || !name || !fullName) {
    throw new Error("Missing required fields");
  }

  // Validate fullName format to prevent injection downstream
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(fullName)) {
    throw new Error("Invalid repository name format");
  }

  // Prevent repo takeover: check if another user already owns this githubRepoId
  const existing = await db.repository.findUnique({
    where: { githubRepoId },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) {
    throw new Error("This repository is already connected by another user");
  }

  // Plan gating: FREE tier limited to 1 connected repo
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const upsertPayload = {
    where: { githubRepoId },
    create: { userId, githubRepoId, name, fullName, defaultBranch, private: isPrivate, language, description },
    update: { name, fullName, defaultBranch, private: isPrivate, language, description },
  };

  if (user?.plan === "FREE") {
    // Atomic count + upsert — prevents two concurrent requests both passing the
    // count check and creating a second repo, bypassing the 1-repo limit.
    await db.$transaction(async (tx) => {
      const repoCount = await tx.repository.count({ where: { userId } });
      if (repoCount >= 1) {
        throw new Error(
          "Free plan allows 1 connected repository. Upgrade to Pro for unlimited repos."
        );
      }
      await tx.repository.upsert(upsertPayload);
    });
  } else {
    await db.repository.upsert(upsertPayload);
  }

  revalidatePath("/dashboard/repos");
}

export async function disconnectRepo(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  await db.repository.delete({
    where: { id: repoId, userId },
  });

  revalidatePath("/dashboard/repos");
}

export async function triggerScan(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  // Rate limit scan triggers
  const rateCheck = await checkRateLimit(userId, "scan-trigger", { max: 10, windowSeconds: 600 });
  if (!rateCheck.allowed) throw new Error("Too many scan requests. Please wait before trying again.");

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId },
    include: { user: { select: { plan: true } } },
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

  // Fire-and-forget: kick off background scan
  const token = await getGitHubToken(userId);
  runScan(scan.id, repo.fullName, token, repo.scanRoot, repo.user.plan, userId).catch(console.error);

  revalidatePath("/dashboard/repos");
  revalidatePath(`/dashboard/${repoId}`);
}
