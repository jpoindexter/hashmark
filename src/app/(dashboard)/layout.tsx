import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DashboardShellWrapper } from "@/components/dashboard/dashboard-shell-wrapper";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, plan: true },
  });

  if (!user) {
    redirect("/login");
  }

  return <DashboardShellWrapper user={user}>{children}</DashboardShellWrapper>;
}
