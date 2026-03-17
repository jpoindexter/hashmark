"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken, createOctokit, createOrUpdateFile } from "@/lib/github";
import { checkRateLimit } from "@/lib/rate-limit";
import { runScan } from "@/lib/scan-worker";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const WORKFLOW_PATH = ".github/workflows/hashmark-scan.yml";

const WORKFLOW_CONTENT = `# Hashmark Auto-Sync
#
# Runs on every push to main/master and regenerates AI context files:
#   AGENTS.md, CLAUDE.md, .cursorrules, .cursor/rules/, GEMINI.md,
#   .windsurfrules, .clinerules, .github/copilot-instructions.md
#
# No secrets required — uses GITHUB_TOKEN automatically
# Requires: Pro or Team plan at https://hashmark.md

name: Hashmark — Update AI Context Files

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

jobs:
  hashmark:
    name: Regenerate AI context files
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install Hashmark CLI
        run: npm install -g hashmark-cli

      - name: Generate AI context files
        run: hashmark --force

      - name: Commit updated context files
        run: |
          git config --local user.email "hashmark-bot@users.noreply.github.com"
          git config --local user.name "Hashmark Bot"
          git add \\
            AGENTS.md \\
            CLAUDE.md \\
            GEMINI.md \\
            .cursorrules \\
            .windsurfrules \\
            .clinerules \\
            ".cursor/rules/" \\
            ".github/copilot-instructions.md" \\
            2>/dev/null || true
          git diff --staged --quiet || \\
            git commit -m "chore: update AI context files [hashmark] [skip ci]"
          git push
`;

export async function installGitHubAction(repoId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { id: true, fullName: true },
  });
  if (!repo) throw new Error("Repository not found");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });
  if (user?.plan === "FREE") throw new Error("GitHub Action requires Pro or Team plan.");

  const token = await getGitHubToken(session.user.id);
  const octokit = createOctokit(token);
  const parts = repo.fullName.split("/");
  if (parts.length !== 2) throw new Error("Invalid repository name in database");
  const [owner, repoName] = parts;

  // Check if file already exists (need SHA to update)
  let existingSha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo: repoName, path: WORKFLOW_PATH });
    if ("sha" in data) existingSha = data.sha;
  } catch {
    // File doesn't exist — that's fine, we'll create it
  }

  await createOrUpdateFile(
    token,
    owner,
    repoName,
    WORKFLOW_PATH,
    WORKFLOW_CONTENT,
    existingSha
      ? "chore: update Hashmark GitHub Action workflow"
      : "chore: add Hashmark GitHub Action for AI context file auto-sync",
    existingSha
  );

  await db.repository.update({
    where: { id: repo.id },
    data: { actionInstalled: true },
  });

  revalidatePath(`/dashboard/${repoId}/settings`);
}

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

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { plan: true } });
  const token = await getGitHubToken(session.user.id);
  runScan(scan.id, repo.fullName, token, repo.scanRoot, user?.plan ?? "FREE", session.user.id).catch(console.error);

  revalidatePath(`/dashboard/${repoId}`);
}
