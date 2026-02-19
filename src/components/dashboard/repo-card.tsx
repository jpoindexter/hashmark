"use client";

import Link from "next/link";
import type { Repository, Scan } from "@prisma/client";
import { Badge, Button, Input } from "@fabrk/components";
import { StatusBadge } from "@/components/shared/status-badge";
import { disconnectRepo, triggerScan } from "@/app/(dashboard)/dashboard/repos/actions";
import {
  installGitHubAction,
  uninstallGitHubAction,
} from "@/app/(dashboard)/dashboard/repos/actions-github";
import { useScanStream } from "@/hooks/use-scan-stream";
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

  const progress = useScanStream(repo.id, latestScan?.status);

  return (
    <div className="mono-box bg-card">
      <div className="flex items-center justify-between">
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-[var(--grid-4)]">
            <Link
              href={`/dashboard/${repo.id}`}
              className="type-body font-bold text-foreground transition-colors hover:text-accent"
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
          <div className="mt-[var(--grid-1)] flex items-center gap-[var(--grid-4)] type-caption text-muted-foreground">
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

        <div className="ml-4 flex items-center gap-[var(--grid-2)]">
          {canAutoSync && (
            <form
              action={
                repo.actionInstalled
                  ? uninstallGitHubAction
                  : installGitHubAction
              }
            >
              <Input type="hidden" name="repoId" value={repo.id} />
              <Button type="submit" variant="ghost" size="sm">
                {repo.actionInstalled ? "REMOVE ACTION" : "> INSTALL ACTION"}
              </Button>
            </form>
          )}
          <form action={triggerScan}>
            <Input type="hidden" name="repoId" value={repo.id} />
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
            <Input type="hidden" name="repoId" value={repo.id} />
            <Button type="submit" variant="ghost" size="sm">
              X
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
