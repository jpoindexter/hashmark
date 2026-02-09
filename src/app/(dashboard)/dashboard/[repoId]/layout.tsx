import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
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
      <div className="mb-6">
        <h1 className="text-lg font-bold uppercase tracking-wider">
          {repo.fullName}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {repo.language && <span>[{repo.language}]</span>}
          {repo.private && (
            <span className="border border-border px-2 py-1 text-[10px]">
              PRIVATE
            </span>
          )}
        </div>
      </div>
      <RepoSubNav repoId={repo.id} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
