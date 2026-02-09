import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
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
      {/* Trial banner for FREE plan */}
      {user?.plan === "FREE" && <TrialBanner />}

      <div>
        <h1 className="text-lg font-bold uppercase tracking-wider">
          DASHBOARD
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Welcome back, {session.user.name ?? "developer"}.
        </p>
      </div>

      {/* Quick stats — 8-point grid: gap-4 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="CONNECTED REPOS" value={repos.length} />
        <StatCard label="TOTAL SCANS" value={totalScans} />
        <StatCard label="PLAN" value={user?.plan ?? "FREE"} accent />
        <StatCard label="FORMATS" value={8} />
      </div>

      {/* Quick actions */}
      <div className="flex gap-4">
        <Link
          href="/dashboard/repos"
          className="border border-accent bg-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {"> MANAGE REPOS"}
        </Link>
        <Link
          href="/dashboard/settings"
          className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {"> SETTINGS"}
        </Link>
      </div>

      {/* Recent activity */}
      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          [ RECENT SCANS ]
        </h2>
        {recentScans.length === 0 ? (
          <div className="border border-dashed border-border p-12 text-center">
            <p className="text-sm uppercase tracking-wider text-muted-foreground">
              NO SCANS YET
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect a repo and run your first scan
            </p>
          </div>
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        [{label}]
      </p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-accent" : ""}`}>
        {value}
      </p>
    </div>
  );
}
