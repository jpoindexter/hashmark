import Link from "next/link";
import type { ScanStatus } from "@prisma/client";
import { GitBranch, ArrowRight } from "lucide-react";
import { EmptyState } from "@fabrk/components";
import { StatusBadge } from "@/components/shared/status-badge";

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

interface PlanUsageSectionProps {
  repoCount: number;
  repoLimit: number;
}

export function PlanUsageSection({
  repoCount,
  repoLimit,
}: PlanUsageSectionProps) {
  return (
    <section>
      <h2 className="mono-section-title text-muted-foreground">PLAN USAGE</h2>
      <div className="mono-box bg-card">
        <div className="flex items-center justify-between">
          <span className="type-label text-muted-foreground">
            Repos: {repoCount}/{repoLimit}
          </span>
          <span className="type-caption text-muted-foreground">
            {Math.round((repoCount / repoLimit) * 100)}%
          </span>
        </div>
        <div className="mt-[var(--grid-2)] h-2 w-full bg-muted">
          <div
            className={`h-full transition-all ${
              repoCount >= repoLimit ? "bg-destructive" : "bg-accent"
            }`}
            style={{
              width: `${Math.min((repoCount / repoLimit) * 100, 100)}%`,
            }}
          />
        </div>
        {repoCount >= repoLimit && (
          <p className="mt-[var(--grid-3)] type-caption text-muted-foreground">
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
  );
}

interface RecentScan {
  id: string;
  status: ScanStatus;
  fileCount: number | null;
  lineCount: number | null;
  error: string | null;
  duration: number | null;
  createdAt: Date;
  repository: { fullName: string; id: string };
}

interface RecentActivitySectionProps {
  recentScans: RecentScan[];
}

export function RecentActivitySection({
  recentScans,
}: RecentActivitySectionProps) {
  return (
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
              className={`flex items-center justify-between px-[var(--grid-6)] py-[var(--grid-4)] transition-colors hover:bg-muted ${
                i < recentScans.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-[var(--grid-4)]">
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
              <div className="flex items-center gap-[var(--grid-3)]">
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
  );
}

interface Repo {
  id: string;
  fullName: string;
  language: string | null;
}

interface ReposQuickViewProps {
  repos: Repo[];
}

export function ReposQuickView({ repos }: ReposQuickViewProps) {
  return (
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
      <div className="mono-grid-3">
        {repos.slice(0, 6).map((repo) => (
          <Link
            key={repo.id}
            href={`/dashboard/${repo.id}`}
            className="flex items-center gap-[var(--grid-3)] border border-border px-[var(--grid-4)] py-[var(--grid-3)] transition-colors hover:bg-muted"
          >
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 overflow-hidden">
              <p className="truncate type-body font-medium">{repo.fullName}</p>
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
  );
}
