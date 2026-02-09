import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DashboardHeader } from "@fabrk/components";
import { RepoSubNav } from "@/components/dashboard/repo-sub-nav";

export default async function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ repoId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { repoId } = await params;

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { id: true, fullName: true, language: true, private: true },
  });

  if (!repo) redirect("/dashboard/repos");

  return (
    <div>
      <DashboardHeader
        title={repo.fullName}
        subtitle={
          [
            repo.language ? `[${repo.language}]` : null,
            repo.private ? "PRIVATE" : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
      />
      <RepoSubNav repoId={repo.id} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
