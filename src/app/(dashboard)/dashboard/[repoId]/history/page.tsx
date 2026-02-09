import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ScanHistoryPage } from "@/components/dashboard/scan-history-page";

export default async function HistoryPage({
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

  const scans = await db.scan.findMany({
    where: { repositoryId: repoId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <ScanHistoryPage scans={scans} />;
}
