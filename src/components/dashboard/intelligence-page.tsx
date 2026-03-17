"use client";

import type { Repository, Scan } from "@prisma/client";
import { StatsGrid, EmptyState, Button, Input, Badge } from "@fabrk/components";
import { Search, AlertTriangle, Layers, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { triggerRepoScan } from "@/app/(dashboard)/dashboard/[repoId]/actions";
import { useScanStream, type ScanProgress } from "@/hooks/use-scan-stream";
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
                className={`h-[var(--grid-1)] w-[var(--grid-8)] ${
                  isActive
                    ? "bg-accent animate-pulse"
                    : isDone
                      ? "bg-accent/60"
                      : "bg-muted"
                }`}
              />
              <span
                className={`type-label ${
                  isActive
                    ? "text-accent"
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

function ScanInfoBar({
  repo,
  scan,
  isScanning,
  progress,
}: {
  repo: Repository;
  scan: Scan | null;
  isScanning: boolean;
  progress: ScanProgress | null;
}) {
  return (
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
        <Input type="hidden" name="repoId" value={repo.id} />
        <Button type="submit" disabled={isScanning}>
          {isScanning ? "SCANNING..." : "> SCAN NOW"}
        </Button>
      </form>
    </div>
  );
}

function ScanKpiGrid({ scan }: { scan: Scan }) {
  return (
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
  );
}

function ArchitecturalFindings({ results }: { results: ScanResults | null }) {
  if (!results) return null;

  return (
    <div className="mono-grid-2">
      {results.importGraph?.hubFiles && results.importGraph.hubFiles.length > 0 && (
        <section>
          <h2 className="mono-section-title text-muted-foreground flex items-center gap-2">
            <Layers className="h-3 w-3" /> HIGH-IMPACT FILES
          </h2>
          <div className="mono-stack">
            {results.importGraph.hubFiles.slice(0, 5).map((hub, i) => (
              <div
                key={i}
                className="mono-box bg-card flex justify-between items-center"
              >
                <span className="type-caption truncate max-w-[240px]">
                  {hub.file}
                </span>
                <Badge variant="outline" size="sm">
                  {hub.importedByCount} dependents
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.securityAudit?.vulnerabilities && (
        <section>
          <h2 className="mono-section-title text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="h-3 w-3" /> SECURITY SUMMARY
          </h2>
          <div className="mono-box bg-card">
            <div className="flex justify-around items-center h-full min-h-[100px]">
              <div className="text-center">
                <p className="type-h2 text-destructive">
                  {results.securityAudit.vulnerabilities.critical}
                </p>
                <p className="type-label text-muted-foreground">CRITICAL</p>
              </div>
              <div className="text-center">
                <p className="type-h2 text-warning">
                  {results.securityAudit.vulnerabilities.high}
                </p>
                <p className="type-label text-muted-foreground">HIGH</p>
              </div>
              <div className="text-center">
                <p className="type-h2 text-accent">
                  {results.securityAudit.vulnerabilities.moderate}
                </p>
                <p className="type-label text-muted-foreground">MODERATE</p>
              </div>
            </div>
          </div>
        </section>
      )}
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
  const progress = useScanStream(repo.id, scan?.status);

  return (
    <div className="mono-stack-lg">
      <ScanInfoBar
        repo={repo}
        scan={scan}
        isScanning={isScanning}
        progress={progress}
      />

      {isScanning && (
        <div className="mono-box border-accent/30 bg-accent/5">
          <div className="flex flex-col items-center gap-[var(--grid-3)]">
            <div className="flex items-center gap-[var(--grid-2)]">
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <p className="type-h3 text-accent">{progress?.step || "SCANNING"}</p>
            </div>
            {progress?.detail && (
              <p className="type-caption text-muted-foreground">{progress.detail}</p>
            )}
            <ScanProgressSteps currentStep={progress?.step} />
          </div>
        </div>
      )}

      {scan?.status === "FAILED" && (
        <div className="flex flex-col items-center gap-[var(--grid-4)] mono-box border-destructive/50 bg-card">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <h3 className="type-h3">[ERROR] SCAN FAILED</h3>
          <p className="max-w-md text-center type-caption text-muted-foreground">
            {scan.error || "An unexpected error occurred during the scan."}
          </p>
        </div>
      )}

      {scan?.status === "COMPLETED" && (
        <>
          <ScanKpiGrid scan={scan} />
          <ArchitecturalFindings results={results} />
        </>
      )}

      {results && <ScanResultsTables results={results} />}

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
