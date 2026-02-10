import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ComplexityPage } from "@/components/dashboard/complexity-page";

export const metadata = {
  title: "Complexity Analysis — Hashmark",
};

export default async function ComplexityRoute({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { repoId } = await params;

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { id: true },
  });
  if (!repo) redirect("/dashboard/repos");

  const latestScan = await db.scan.findFirst({
    where: { repositoryId: repoId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { results: true },
  });

  const results = latestScan?.results as Record<string, unknown> | null;
  const astComplexity = results?.astComplexity as {
    topFunctions: Array<{
      name: string;
      file: string;
      line: number;
      cyclomatic: number;
      cognitive: number;
      halstead: { volume: number; effort: number; estimatedBugs: number };
      maintainabilityIndex: number;
    }>;
    fileScores: Array<{
      path: string;
      score: number;
      level: string;
      maintainabilityIndex?: number;
    }>;
  } | undefined;

  return (
    <ComplexityPage
      data={astComplexity ?? null}
      hasScan={!!latestScan}
    />
  );
}
