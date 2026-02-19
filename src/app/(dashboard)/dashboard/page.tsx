import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { DashboardHeader, StatsGrid, Button } from "@fabrk/components";
import { TrialBanner } from "@/components/dashboard/trial-banner";
import {
  PlanUsageSection,
  RecentActivitySection,
  ReposQuickView,
} from "@/components/dashboard/dashboard-overview-sections";
import { UpgradeSuccessToast } from "@/components/dashboard/upgrade-success-toast";

export const metadata = {
  title: "Dashboard — Hashmark",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const upgraded = params.upgraded === "true";

  const [user, repos, recentScans, totalScans] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    }),
    db.repository.findMany({
      where: { userId: session.user.id },
      select: { id: true, fullName: true, language: true },
    }),
    db.scan.findMany({
      where: { repository: { userId: session.user.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        repository: { select: { fullName: true, id: true } },
      },
    }),
    db.scan.count({
      where: { repository: { userId: session.user.id } },
    }),
  ]);

  const plan = user?.plan ?? "FREE";
  const repoLimit = plan === "FREE" ? 1 : null;

  return (
    <div className="mono-stack-lg">
      <UpgradeSuccessToast show={upgraded} />
      {plan === "FREE" && <TrialBanner />}

      <DashboardHeader
        title="DASHBOARD"
        subtitle={`Welcome back, ${session.user.name ?? "developer"}.`}
      />

      <StatsGrid
        items={[
          { label: "CONNECTED REPOS", value: repos.length },
          { label: "TOTAL SCANS", value: totalScans },
          { label: "PLAN", value: plan },
          { label: "FORMATS", value: 8 },
        ]}
        columns={4}
      />

      <section>
        <h2 className="mono-section-title text-muted-foreground">
          QUICK ACTIONS
        </h2>
        <div className="flex gap-[var(--grid-4)]">
          <Button asChild>
            <Link href="/dashboard/repos?connect=true">
              {"> CONNECT REPO"}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/repos">{"> MANAGE REPOS"}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/settings">{"> SETTINGS"}</Link>
          </Button>
        </div>
      </section>

      {plan === "FREE" && repoLimit && (
        <PlanUsageSection repoCount={repos.length} repoLimit={repoLimit} />
      )}

      <RecentActivitySection recentScans={recentScans} />

      {repos.length > 0 && <ReposQuickView repos={repos} />}
    </div>
  );
}
