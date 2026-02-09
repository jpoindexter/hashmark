import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SettingsPage } from "@/components/dashboard/settings-page";

export const metadata = {
  title: "Settings — Hashmark",
};

export default async function SettingsRoute() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      customRules: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!user) redirect("/login");

  return <SettingsPage user={user} rules={user.customRules} />;
}
