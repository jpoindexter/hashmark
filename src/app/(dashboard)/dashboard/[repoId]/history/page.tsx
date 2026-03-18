import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ScanHistoryPage } from "@/components/dashboard/scan-history-page";

export const metadata = {
  title: "Scan History — Hashmark",
};

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { repoId } = await params;

  const [repo, user] = await Promise.all([
    db.repository.findUnique({
      where: { id: repoId, userId: session.user.id },
      select: { id: true },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    }),
  ]);

  if (!repo) redirect("/dashboard/repos");

  const plan = user?.plan ?? "FREE";

  const scans =
    plan === "FREE"
      ? []
      : await db.scan.findMany({
          where: { repositoryId: repoId },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

  return <ScanHistoryPage repoId={repoId} scans={scans} plan={plan} />;
}
