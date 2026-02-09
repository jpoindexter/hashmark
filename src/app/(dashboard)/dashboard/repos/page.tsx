import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ReposPage } from "@/components/dashboard/repos-page";

export const metadata = {
  title: "Repositories — Hashmark",
};

export default async function ReposRoute() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [repos, user] = await Promise.all([
    db.repository.findMany({
      where: { userId: session.user.id },
      include: {
        scans: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    }),
  ]);

  const plan = user?.plan ?? "FREE";

  return <ReposPage repos={repos} plan={plan} />;
}
