import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { IntelligencePage } from "@/components/dashboard/intelligence-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;
  const repo = await db.repository.findUnique({
    where: { id: repoId },
    select: { fullName: true },
  });
  return { title: `${repo?.fullName ?? "Repo"} — Hashmark` };
}

export default async function RepoIntelligencePage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { repoId } = await params;

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    include: {
      scans: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!repo) redirect("/dashboard/repos");

  const latestScan = repo.scans[0] ?? null;

  return <IntelligencePage repo={repo} scan={latestScan} />;
}
