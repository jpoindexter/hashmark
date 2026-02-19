"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken } from "@/lib/github";
import { checkRateLimit } from "@/lib/rate-limit";
import { runScan } from "@/lib/scan-worker";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const scanRootSchema = z
  .string()
  .max(256)
  .refine((val) => !val.includes(".."), "Path traversal not allowed")
  .refine((val) => !val.startsWith("/"), "Must be a relative path")
  .refine(
    (val) => !/[<>|"'`${}();&]/.test(val),
    "Path contains invalid characters"
  )
  .transform((val) => val.replace(/^\/+|\/+$/g, "").trim());

export async function updateRepoScanRoot(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  const raw = (formData.get("scanRoot") as string) ?? "";
  const parsed = scanRootSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid scan root");
  }

  const scanRoot = parsed.data || null;

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { id: true },
  });
  if (!repo) throw new Error("Repository not found");

  await db.repository.update({
    where: { id: repo.id },
    data: { scanRoot },
  });

  revalidatePath(`/dashboard/${repoId}`);
  revalidatePath(`/dashboard/${repoId}/settings`);
}

export async function triggerRepoScan(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  // Rate limit scan triggers
  const rateCheck = await checkRateLimit(session.user.id, "scan-trigger", { max: 10, windowSeconds: 600 });
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
  runScan(scan.id, repo.fullName, token, repo.scanRoot).catch(console.error);

  revalidatePath(`/dashboard/${repoId}`);
}
