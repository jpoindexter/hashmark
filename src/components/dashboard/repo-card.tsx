"use client";

import Link from "next/link";
import type { Repository, Scan } from "@prisma/client";
import { StatusBadge } from "@/components/shared/status-badge";
import { disconnectRepo, triggerScan } from "@/app/(dashboard)/dashboard/repos/actions";

type RepoWithLatestScan = Repository & {
  scans: Pick<Scan, "id" | "status" | "createdAt">[];
};

export function RepoCard({ repo }: { repo: RepoWithLatestScan }) {
  const latestScan = repo.scans[0] ?? null;
  const isScanning = latestScan?.status === "SCANNING";

  return (
    <div className="flex items-center justify-between border border-border bg-card px-6 py-4">
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/${repo.id}`}
            className="text-sm font-bold text-foreground transition-colors hover:text-accent"
          >
            {repo.fullName}
          </Link>
          {repo.private && (
            <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              PRIVATE
            </span>
          )}
          {latestScan && <StatusBadge status={latestScan.status} />}
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          {repo.language && <span>[{repo.language}]</span>}
          {repo.description && (
            <span className="truncate">{repo.description}</span>
          )}
          {latestScan && (
            <span>
              Scanned{" "}
              {new Date(latestScan.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="ml-4 flex items-center gap-2">
        <form action={triggerScan}>
          <input type="hidden" name="repoId" value={repo.id} />
          <button
            type="submit"
            disabled={isScanning}
            className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"
          >
            {isScanning ? "SCANNING..." : "> SCAN"}
          </button>
        </form>
        <form action={disconnectRepo}>
          <input type="hidden" name="repoId" value={repo.id} />
          <button
            type="submit"
            className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            X
          </button>
        </form>
      </div>
    </div>
  );
}
