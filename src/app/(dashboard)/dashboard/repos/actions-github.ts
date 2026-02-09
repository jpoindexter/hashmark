"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken, createOctokit } from "@/lib/github";
import { revalidatePath } from "next/cache";

const WORKFLOW_YAML = `name: Hashmark Sync
on:
  push:
    branches: [main, master]
    paths-ignore:
      - 'AGENTS.md'
      - 'CLAUDE.md'
      - '.cursorrules'
      - '.cursor/**'
      - '.github/copilot-instructions.md'
      - '.windsurfrules'
      - 'GEMINI.md'
      - '.clinerules'

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashmark-dev/hashmark-action@v1
        with:
          formats: all
          force: true
`;

export async function installGitHubAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { fullName: true, actionInstalled: true },
  });
  if (!repo) throw new Error("Repository not found");

  if (repo.actionInstalled) return;

  const token = await getGitHubToken(session.user.id);
  const octokit = createOctokit(token);
  const [owner, repoName] = repo.fullName.split("/");

  // Check if workflow file already exists
  let existingSha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: ".github/workflows/hashmark.yml",
    });
    if (!Array.isArray(data) && data.type === "file") {
      existingSha = data.sha;
    }
  } catch (err: unknown) {
    // 404 = file doesn't exist, which is expected
    if (
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      (err as { status: number }).status !== 404
    ) {
      throw err;
    }
  }

  // Create or update the workflow file
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo: repoName,
    path: ".github/workflows/hashmark.yml",
    message: "chore: add Hashmark auto-sync workflow",
    content: Buffer.from(WORKFLOW_YAML).toString("base64"),
    sha: existingSha,
  });

  // Mark as installed in DB
  await db.repository.update({
    where: { id: repoId },
    data: { actionInstalled: true },
  });

  revalidatePath("/dashboard/repos");
  revalidatePath(`/dashboard/${repoId}`);
}

export async function uninstallGitHubAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const repoId = formData.get("repoId") as string;
  if (!repoId) throw new Error("Missing repoId");

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { fullName: true, actionInstalled: true },
  });
  if (!repo) throw new Error("Repository not found");

  if (!repo.actionInstalled) return;

  const token = await getGitHubToken(session.user.id);
  const octokit = createOctokit(token);
  const [owner, repoName] = repo.fullName.split("/");

  // Get the file SHA to delete it
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: ".github/workflows/hashmark.yml",
    });
    if (!Array.isArray(data) && data.type === "file") {
      await octokit.repos.deleteFile({
        owner,
        repo: repoName,
        path: ".github/workflows/hashmark.yml",
        message: "chore: remove Hashmark auto-sync workflow",
        sha: data.sha,
      });
    }
  } catch (err: unknown) {
    // If file doesn't exist, still mark as uninstalled
    if (
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      (err as { status: number }).status !== 404
    ) {
      throw err;
    }
  }

  await db.repository.update({
    where: { id: repoId },
    data: { actionInstalled: false },
  });

  revalidatePath("/dashboard/repos");
  revalidatePath(`/dashboard/${repoId}`);
}
