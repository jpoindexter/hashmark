"use client";

import type { Repository, Scan } from "@prisma/client";
import { StatsGrid, EmptyState, Button, Badge } from "@fabrk/components";
import { Search, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { triggerRepoScan } from "@/app/(dashboard)/dashboard/[repoId]/actions";
import { useScanPolling } from "@/hooks/use-scan-polling";

interface ScanResults {
  components?: Array<{ name: string; path: string; category?: string }>;
  apiRoutes?: Array<{ path: string; method: string; auth?: boolean }>;
  complexity?: Array<{ path: string; score: number; lines: number }>;
  scanners?: Array<{ name: string; found: number }>;
}

const SCAN_STEPS = ["QUEUED", "CLONING", "SCANNING", "PARSING", "COLLECTING"] as const;

function ScanProgressSteps({ currentStep }: { currentStep?: string }) {
  const currentIndex = currentStep
    ? SCAN_STEPS.indexOf(currentStep as (typeof SCAN_STEPS)[number])
    : -1;

  return (
    <div className="flex items-center gap-1 pt-2">
      {SCAN_STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div key={step} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1">
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
    <div className="space-y-6">
      {/* Scan info bar */}
      <div className="flex items-center justify-between border border-border bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          {scan ? (
            <>
              <StatusBadge status={scan.status} />
              {isScanning && progress ? (
                <span className="text-xs text-muted-foreground animate-pulse">
                  {progress.detail || progress.step}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {scan.duration
                    ? `${(scan.duration / 1000).toFixed(1)}s`
                    : "—"}{" "}
                  &middot; {new Date(scan.createdAt).toLocaleString()}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
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
        <div className="border border-accent/30 bg-accent/5 px-6 py-8">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <p className="text-sm font-bold uppercase tracking-wider text-accent">
                {progress?.step || "SCANNING"}
              </p>
            </div>
            {progress?.detail && (
              <p className="text-xs text-muted-foreground">
                {progress.detail}
              </p>
            )}
            <ScanProgressSteps currentStep={progress?.step} />
          </div>
        </div>
      )}

      {/* Scan failed */}
      {scan?.status === "FAILED" && (
        <div className="flex flex-col items-center gap-4 border border-destructive/50 bg-card px-8 py-12">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            [ERROR] SCAN FAILED
          </h3>
          <p className="max-w-md text-center text-xs text-muted-foreground">
            {scan.error || "An unexpected error occurred during the scan."}
          </p>
          <p className="text-xs text-muted-foreground">
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

      {/* Components table */}
      {results?.components && results.components.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider">
            [ COMPONENTS ]
          </h2>
          <div className="border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    NAME
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    PATH
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    CATEGORY
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.components.map((comp, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-sm font-medium">
                      {comp.name}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {comp.path}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {comp.category ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* API Routes table */}
      {results?.apiRoutes && results.apiRoutes.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider">
            [ API ROUTES ]
          </h2>
          <div className="border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    METHOD
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    PATH
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    AUTH
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.apiRoutes.map((route, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Badge variant="outline">{route.method}</Badge>
                    </td>
                    <td className="px-4 py-2 text-sm">{route.path}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {route.auth ? "YES" : "NO"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Complexity hotspots */}
      {results?.complexity && results.complexity.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider">
            [ COMPLEXITY HOTSPOTS ]
          </h2>
          <div className="border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    FILE
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    LINES
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    SCORE
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.complexity.map((file, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-sm">{file.path}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {file.lines.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`text-xs font-bold ${
                          file.score >= 70
                            ? "text-destructive"
                            : file.score >= 40
                              ? "text-warning"
                              : "text-accent"
                        }`}
                      >
                        {file.score}/100
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scanner coverage */}
      {results?.scanners && results.scanners.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider">
            [ SCANNER COVERAGE ]
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {results.scanners.map((scanner) => (
              <div
                key={scanner.name}
                className="flex items-center justify-between border border-border px-4 py-2"
              >
                <span className="text-xs text-muted-foreground">
                  {scanner.name}
                </span>
                <span
                  className={`text-xs font-bold ${
                    scanner.found > 0 ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  {scanner.found}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
