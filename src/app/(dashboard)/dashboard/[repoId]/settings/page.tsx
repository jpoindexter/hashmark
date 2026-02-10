import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RepoSettingsPage } from "@/components/dashboard/repo-settings-page";

export const metadata = {
  title: "Repository Settings — Hashmark",
};

export default async function SettingsRoute({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { repoId } = await params;

  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { id: true, name: true, fullName: true, scanRoot: true },
  });
  if (!repo) redirect("/dashboard/repos");

  return (
    <RepoSettingsPage
      repoId={repoId}
      repoName={repo.fullName}
      scanRoot={repo.scanRoot}
    />
  );
}
