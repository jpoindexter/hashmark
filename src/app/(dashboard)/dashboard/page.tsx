import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import {
  DashboardHeader,
  StatsGrid,
  EmptyState,
  Button,
} from "@fabrk/components";
import { GitBranch, ArrowRight } from "lucide-react";
import { TrialBanner } from "@/components/dashboard/trial-banner";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = {
  title: "Dashboard — Hashmark",
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

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
      {plan === "FREE" && <TrialBanner />}

      {upgraded && (
        <div className="border border-accent bg-accent/10 px-6 py-4">
          <p className="type-h3 text-accent">
            UPGRADE SUCCESSFUL
          </p>
          <p className="mt-1 type-caption text-muted-foreground">
            Your plan has been upgraded. All features are now unlocked.
          </p>
        </div>
      )}

      <DashboardHeader
        title="DASHBOARD"
        subtitle={`Welcome back, ${session.user.name ?? "developer"}.`}
      />

      {/* KPI Stats */}
      <StatsGrid
        items={[
          { label: "CONNECTED REPOS", value: repos.length },
          { label: "TOTAL SCANS", value: totalScans },
          { label: "PLAN", value: plan },
          { label: "FORMATS", value: 8 },
        ]}
        columns={4}
      />

      {/* Quick Actions */}
      <section>
        <h2 className="mono-section-title text-muted-foreground">
          QUICK ACTIONS
        </h2>
        <div className="flex gap-4">
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

      {/* Plan Usage (FREE tier only) */}
      {plan === "FREE" && repoLimit && (
        <section>
          <h2 className="mono-section-title text-muted-foreground">
            PLAN USAGE
          </h2>
          <div className="mono-box bg-card">
            <div className="flex items-center justify-between">
              <span className="type-label text-muted-foreground">
                Repos: {repos.length}/{repoLimit}
              </span>
              <span className="type-caption text-muted-foreground">
                {Math.round((repos.length / repoLimit) * 100)}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full bg-muted">
              <div
                className={`h-full transition-all ${
                  repos.length >= repoLimit ? "bg-destructive" : "bg-accent"
                }`}
                style={{
                  width: `${Math.min((repos.length / repoLimit) * 100, 100)}%`,
                }}
              />
            </div>
            {repos.length >= repoLimit && (
              <p className="mt-3 type-caption text-muted-foreground">
                <Link
                  href="/dashboard/billing"
                  className="text-accent transition-colors hover:underline"
                >
                  {"> UPGRADE TO PRO"}
                </Link>{" "}
                for unlimited repositories
              </p>
            )}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section>
        <h2 className="mono-section-title text-muted-foreground">
          RECENT ACTIVITY
        </h2>
        {recentScans.length === 0 ? (
          <EmptyState
            title="NO SCANS YET"
            description="Connect a repo and run your first scan to see activity here"
          />
        ) : (
          <div className="border border-border">
            {recentScans.map((scan, i) => (
              <Link
                key={scan.id}
                href={`/dashboard/${scan.repository.id}`}
                className={`flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted ${
                  i < recentScans.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <StatusBadge status={scan.status} />
                  <div>
                    <p className="type-body font-medium">
                      {scan.repository.fullName}
                    </p>
                    <p className="mt-0.5 type-caption text-muted-foreground">
                      {scan.status === "COMPLETED" && scan.fileCount
                        ? `${scan.fileCount.toLocaleString()} files, ${(scan.lineCount ?? 0).toLocaleString()} lines`
                        : scan.status === "FAILED" && scan.error
                          ? `Error: ${scan.error}`
                          : scan.status === "SCANNING"
                            ? "Analyzing repository..."
                            : "Queued"}
                      {scan.duration
                        ? ` · ${(scan.duration / 1000).toFixed(1)}s`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="type-caption text-muted-foreground">
                    {timeAgo(new Date(scan.createdAt))}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Connected Repos Quick View */}
      {repos.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="mono-section-title text-muted-foreground">
              REPOSITORIES
            </h2>
            <Link
              href="/dashboard/repos"
              className="text-xs text-accent transition-colors hover:underline"
            >
              {"> VIEW ALL"}
            </Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {repos.slice(0, 6).map((repo) => (
              <Link
                key={repo.id}
                href={`/dashboard/${repo.id}`}
                className="flex items-center gap-3 border border-border px-4 py-3 transition-colors hover:bg-muted"
              >
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 overflow-hidden">
                  <p className="truncate type-body font-medium">
                    {repo.fullName}
                  </p>
                  {repo.language && (
                    <p className="type-caption text-muted-foreground">
                      [{repo.language}]
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
