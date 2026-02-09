import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { FilesPage } from "@/components/dashboard/files-page";

export const metadata = {
  title: "Generated Files — Hashmark",
};

export default async function FilesRoute({
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

  // Get files from the latest completed scan
  const latestScan = await db.scan.findFirst({
    where: { repositoryId: repoId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { generatedFiles: true },
  });

  return (
    <FilesPage
      repoId={repoId}
      files={latestScan?.generatedFiles ?? []}
      hasScan={!!latestScan}
    />
  );
}
