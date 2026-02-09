"use client";

import type { Repository, Scan } from "@prisma/client";
import { StatusBadge } from "@/components/shared/status-badge";
import { KpiGrid } from "./kpi-grid";
import { triggerRepoScan } from "@/app/(dashboard)/dashboard/[repoId]/actions";

interface ScanResults {
  components?: Array<{ name: string; path: string; category?: string }>;
  apiRoutes?: Array<{ path: string; method: string; auth?: boolean }>;
  complexity?: Array<{ path: string; score: number; lines: number }>;
  scanners?: Array<{ name: string; found: number }>;
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

  return (
    <div className="space-y-6">
      {/* Scan info bar */}
      <div className="flex items-center justify-between border border-border bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          {scan ? (
            <>
              <StatusBadge status={scan.status} />
              <span className="text-xs text-muted-foreground">
                {scan.duration
                  ? `${(scan.duration / 1000).toFixed(1)}s`
                  : "—"}{" "}
                &middot; {new Date(scan.createdAt).toLocaleString()}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              NO SCANS YET
            </span>
          )}
        </div>
        <form action={triggerRepoScan}>
          <input type="hidden" name="repoId" value={repo.id} />
          <button
            type="submit"
            disabled={isScanning}
            className="border border-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            {isScanning ? "SCANNING..." : "> SCAN NOW"}
          </button>
        </form>
      </div>

      {/* KPI Grid */}
      {scan?.status === "COMPLETED" && (
        <KpiGrid
          fileCount={scan.fileCount ?? 0}
          lineCount={scan.lineCount ?? 0}
          componentCount={scan.componentCount ?? 0}
          apiRouteCount={scan.apiRouteCount ?? 0}
          modelCount={scan.modelCount ?? 0}
          tokenEstimate={scan.tokenEstimate ?? 0}
          duration={scan.duration ?? 0}
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
                      <span className="border border-border px-2 py-1 text-xs font-bold">
                        {route.method}
                      </span>
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
        <div className="border border-dashed border-border p-12 text-center">
          <p className="text-2xl font-bold text-accent">#</p>
          <p className="mt-2 text-sm uppercase tracking-wider text-muted-foreground">
            RUN YOUR FIRST SCAN
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click &quot;SCAN NOW&quot; to analyze your codebase
          </p>
        </div>
      )}
    </div>
  );
}
