"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken } from "@/lib/github";
import { revalidatePath } from "next/cache";

export async function connectRepo(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

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

  await db.repository.upsert({
    where: { githubRepoId },
    create: {
      userId: session.user.id,
      githubRepoId,
      name,
      fullName,
      defaultBranch,
      private: isPrivate,
      language,
      description,
    },
    update: {
      userId: session.user.id,
      name,
      fullName,
      defaultBranch,
      private: isPrivate,
      language,
      description,
    },
  });

  revalidatePath("/dashboard/repos");
}

export async function disconnectRepo(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  await db.repository.delete({
    where: { id: repoId, userId: session.user.id },
  });

  revalidatePath("/dashboard/repos");
}

export async function triggerScan(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
  });
  if (!repo) throw new Error("Repository not found");

  // Create a pending scan
  const scan = await db.scan.create({
    data: {
      repositoryId: repoId,
      status: "PENDING",
    },
  });

  // Fire-and-forget: kick off background scan
  // In production, this would call the scan worker
  const token = await getGitHubToken(session.user.id);
  runScanInBackground(scan.id, repo.fullName, token).catch(console.error);

  revalidatePath("/dashboard/repos");
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
    // For now, mark as completed after a delay to simulate
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        duration: 3000,
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
