"use client";

import Link from "next/link";
import type { Repository, Scan } from "@prisma/client";
import { Badge, Button } from "@fabrk/components";
import { StatusBadge } from "@/components/shared/status-badge";
import { disconnectRepo, triggerScan } from "@/app/(dashboard)/dashboard/repos/actions";
import {
  installGitHubAction,
  uninstallGitHubAction,
} from "@/app/(dashboard)/dashboard/repos/actions-github";
import { useScanPolling } from "@/hooks/use-scan-polling";
import { Zap } from "lucide-react";

type RepoWithLatestScan = Repository & {
  scans: Pick<Scan, "id" | "status" | "createdAt">[];
};

export function RepoCard({
  repo,
  plan,
}: {
  repo: RepoWithLatestScan;
  plan: string;
}) {
  const latestScan = repo.scans[0] ?? null;
  const isScanning =
    latestScan?.status === "SCANNING" || latestScan?.status === "PENDING";
  const canAutoSync = plan !== "FREE";

  const progress = useScanPolling(repo.id, latestScan?.status);

  return (
    <div className="border border-border bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-4">
            <Link
              href={`/dashboard/${repo.id}`}
              className="text-sm font-bold text-foreground transition-colors hover:text-accent"
            >
              {repo.fullName}
            </Link>
            {repo.private && (
              <Badge variant="outline" size="sm">
                PRIVATE
              </Badge>
            )}
            {repo.actionInstalled && (
              <Badge variant="accent" size="sm">
                <Zap className="mr-1 h-2.5 w-2.5" />
                AUTO-SYNC
              </Badge>
            )}
            {latestScan && <StatusBadge status={latestScan.status} />}
          </div>
          <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
            {repo.language && <span>[{repo.language}]</span>}
            {repo.description && (
              <span className="truncate">{repo.description}</span>
            )}
            {isScanning && progress?.detail ? (
              <span className="animate-pulse text-accent/70">
                {progress.detail}
              </span>
            ) : latestScan ? (
              <span>
                Scanned{" "}
                {new Date(latestScan.createdAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        </div>

        <div className="ml-4 flex items-center gap-2">
          {canAutoSync && (
            <form
              action={
                repo.actionInstalled
                  ? uninstallGitHubAction
                  : installGitHubAction
              }
            >
              <input type="hidden" name="repoId" value={repo.id} />
              <Button type="submit" variant="ghost" size="sm">
                {repo.actionInstalled ? "REMOVE ACTION" : "> INSTALL ACTION"}
              </Button>
            </form>
          )}
          <form action={triggerScan}>
            <input type="hidden" name="repoId" value={repo.id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isScanning}
            >
              {isScanning
                ? progress?.step || "SCANNING..."
                : "> SCAN"}
            </Button>
          </form>
          <form action={disconnectRepo}>
            <input type="hidden" name="repoId" value={repo.id} />
            <Button type="submit" variant="ghost" size="sm">
              X
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
