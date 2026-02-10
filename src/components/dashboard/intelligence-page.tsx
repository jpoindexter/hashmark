"use client";

import type { Repository, Scan } from "@prisma/client";
import { StatsGrid, EmptyState, Button } from "@fabrk/components";
import { Search, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { triggerRepoScan } from "@/app/(dashboard)/dashboard/[repoId]/actions";
import { useScanPolling } from "@/hooks/use-scan-polling";
import {
  ScanResultsTables,
  type ScanResults,
} from "@/components/dashboard/scan-results-tables";

const SCAN_STEPS = [
  "QUEUED",
  "CLONING",
  "SCANNING",
  "PARSING",
  "COLLECTING",
] as const;

function ScanProgressSteps({ currentStep }: { currentStep?: string }) {
  const currentIndex = currentStep
    ? SCAN_STEPS.indexOf(currentStep as (typeof SCAN_STEPS)[number])
    : -1;

  return (
    <div className="flex items-center gap-[var(--grid-1)] pt-2">
      {SCAN_STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div key={step} className="flex items-center gap-[var(--grid-1)]">
            <div className="flex flex-col items-center gap-[var(--grid-1)]">
              <div
                className={`h-1.5 w-8 ${
                  isActive
                    ? "bg-accent animate-pulse"
                    : isDone
                      ? "bg-accent/60"
                      : "bg-muted"
                }`}
              />
              <span
                className={`text-[9px] uppercase tracking-wider ${
                  isActive
                    ? "text-accent font-bold"
                    : isDone
                      ? "text-accent/60"
                      : "text-muted-foreground/50"
                }`}
              >
                {step}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function IntelligencePage({
  repo,
  scan,
}: {
  repo: Repository;
  scan: Scan | null;
}) {
  const results = (scan?.results as ScanResults) ?? null;
  const isScanning = scan?.status === "SCANNING" || scan?.status === "PENDING";

  const progress = useScanPolling(repo.id, scan?.status);

  return (
    <div className="mono-stack-lg">
      {/* Scan info bar */}
      <div className="flex items-center justify-between mono-box bg-card">
        <div className="flex items-center gap-[var(--grid-4)]">
          {scan ? (
            <>
              <StatusBadge status={scan.status} />
              {isScanning && progress ? (
                <span className="type-caption text-muted-foreground animate-pulse">
                  {progress.detail || progress.step}
                </span>
              ) : (
                <span className="type-caption text-muted-foreground">
                  {scan.duration
                    ? `${(scan.duration / 1000).toFixed(1)}s`
                    : "—"}{" "}
                  &middot; {new Date(scan.createdAt).toLocaleString()}
                </span>
              )}
            </>
          ) : (
            <span className="type-caption text-muted-foreground">
              NO SCANS YET
            </span>
          )}
        </div>
        <form action={triggerRepoScan}>
          <input type="hidden" name="repoId" value={repo.id} />
          <Button type="submit" disabled={isScanning}>
            {isScanning ? "SCANNING..." : "> SCAN NOW"}
          </Button>
        </form>
      </div>

      {/* Scan in progress */}
      {isScanning && (
        <div className="mono-box border-accent/30 bg-accent/5">
          <div className="flex flex-col items-center gap-[var(--grid-3)]">
            <div className="flex items-center gap-[var(--grid-2)]">
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <p className="type-h3 text-accent">
                {progress?.step || "SCANNING"}
              </p>
            </div>
            {progress?.detail && (
              <p className="type-caption text-muted-foreground">
                {progress.detail}
              </p>
            )}
            <ScanProgressSteps currentStep={progress?.step} />
          </div>
        </div>
      )}

      {/* Scan failed */}
      {scan?.status === "FAILED" && (
        <div className="flex flex-col items-center gap-[var(--grid-4)] mono-box border-destructive/50 bg-card">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <h3 className="type-h3">[ERROR] SCAN FAILED</h3>
          <p className="max-w-md text-center type-caption text-muted-foreground">
            {scan.error || "An unexpected error occurred during the scan."}
          </p>
          <p className="type-caption text-muted-foreground">
            Common causes: repository access revoked, network timeout, or
            unsupported project structure.
          </p>
        </div>
      )}

      {/* KPI Grid */}
      {scan?.status === "COMPLETED" && (
        <StatsGrid
          items={[
            { label: "FILES", value: (scan.fileCount ?? 0).toLocaleString() },
            { label: "LINES", value: (scan.lineCount ?? 0).toLocaleString() },
            { label: "COMPONENTS", value: scan.componentCount ?? 0 },
            { label: "API ROUTES", value: scan.apiRouteCount ?? 0 },
            { label: "MODELS", value: scan.modelCount ?? 0 },
            {
              label: "EST. TOKENS",
              value:
                (scan.tokenEstimate ?? 0) >= 1000
                  ? `${((scan.tokenEstimate ?? 0) / 1000).toFixed(1)}k`
                  : String(scan.tokenEstimate ?? 0),
            },
            {
              label: "SCAN TIME",
              value: `${((scan.duration ?? 0) / 1000).toFixed(1)}s`,
            },
          ]}
          columns={4}
        />
      )}

      {results && <ScanResultsTables results={results} />}

      {/* Empty state */}
      {!scan && (
        <EmptyState
          icon={Search}
          title="RUN YOUR FIRST SCAN"
          description='Click "SCAN NOW" to analyze your codebase'
        />
      )}
    </div>
  );
}
