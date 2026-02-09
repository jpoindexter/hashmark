import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGitHubToken, getUserRepos } from "@/lib/github";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await getGitHubToken(session.user.id);
    const githubRepos = await getUserRepos(token);

    // Get connected repo IDs
    const connectedRepos = await db.repository.findMany({
      where: { userId: session.user.id },
      select: { githubRepoId: true },
    });
    const connectedIds = new Set(connectedRepos.map((r) => r.githubRepoId));

    const repos = githubRepos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      language: repo.language,
      private: repo.private,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
      connected: connectedIds.has(repo.id),
    }));

    return NextResponse.json(repos);
  } catch (error) {
    console.error("Failed to fetch GitHub repos:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
