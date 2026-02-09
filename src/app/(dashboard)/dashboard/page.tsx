import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { DashboardHeader, StatsGrid, EmptyState, Button } from "@fabrk/components";
import { TrialBanner } from "@/components/dashboard/trial-banner";

export const metadata = {
  title: "Dashboard — Hashmark",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
      take: 6,
      include: {
        repository: { select: { fullName: true, id: true } },
      },
    }),
    db.scan.count({
      where: { repository: { userId: session.user.id } },
    }),
  ]);

  return (
    <div className="space-y-6">
      {user?.plan === "FREE" && <TrialBanner />}

      <DashboardHeader
        title="DASHBOARD"
        subtitle={`Welcome back, ${session.user.name ?? "developer"}.`}
      />

      <StatsGrid
        items={[
          { label: "CONNECTED REPOS", value: repos.length },
          { label: "TOTAL SCANS", value: totalScans },
          { label: "PLAN", value: user?.plan ?? "FREE" },
          { label: "FORMATS", value: 8 },
        ]}
        columns={4}
      />

      <div className="flex gap-4">
        <Button asChild>
          <Link href="/dashboard/repos">{"> MANAGE REPOS"}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/settings">{"> SETTINGS"}</Link>
        </Button>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          [ RECENT SCANS ]
        </h2>
        {recentScans.length === 0 ? (
          <EmptyState
            title="NO SCANS YET"
            description="Connect a repo and run your first scan"
          />
        ) : (
          <div className="border border-border">
            {recentScans.map((scan, i) => (
              <Link
                key={scan.id}
                href={`/dashboard/${scan.repository.id}`}
                className={`flex items-center justify-between px-4 py-4 transition-colors hover:bg-muted ${
                  i < recentScans.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-medium">
                    {scan.repository.fullName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(scan.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold uppercase ${
                    scan.status === "COMPLETED"
                      ? "text-accent"
                      : scan.status === "FAILED"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  [{scan.status}]
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
