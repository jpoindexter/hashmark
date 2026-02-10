"use client";

import { Badge } from "@fabrk/components";

export interface ScanResults {
  components?: Array<{ name: string; path: string; category?: string }>;
  apiRoutes?: Array<{ path: string; method: string; auth?: boolean }>;
  complexity?: Array<{ path: string; score: number; lines: number }>;
  scanners?: Array<{ name: string; found: number }>;
}

interface ScanResultsTablesProps {
  results: ScanResults;
}

export function ScanResultsTables({ results }: ScanResultsTablesProps) {
  return (
    <>
      {results.components && results.components.length > 0 && (
        <section>
          <h2 className="mono-section-title">COMPONENTS</h2>
          <table className="mono-table">
            <thead>
              <tr className="bg-muted">
                <th className="type-label text-muted-foreground">NAME</th>
                <th className="type-label text-muted-foreground">PATH</th>
                <th className="type-label text-muted-foreground">CATEGORY</th>
              </tr>
            </thead>
            <tbody>
              {results.components.map((comp, i) => (
                <tr key={i}>
                  <td className="type-body font-medium">{comp.name}</td>
                  <td className="type-caption text-muted-foreground">
                    {comp.path}
                  </td>
                  <td className="type-caption text-muted-foreground">
                    {comp.category ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {results.apiRoutes && results.apiRoutes.length > 0 && (
        <section>
          <h2 className="mono-section-title">API ROUTES</h2>
          <table className="mono-table">
            <thead>
              <tr className="bg-muted">
                <th className="type-label text-muted-foreground">METHOD</th>
                <th className="type-label text-muted-foreground">PATH</th>
                <th className="type-label text-muted-foreground">AUTH</th>
              </tr>
            </thead>
            <tbody>
              {results.apiRoutes.map((route, i) => (
                <tr key={i}>
                  <td>
                    <Badge variant="outline">{route.method}</Badge>
                  </td>
                  <td className="type-body">{route.path}</td>
                  <td className="type-caption text-muted-foreground">
                    {route.auth ? "YES" : "NO"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {results.complexity && results.complexity.length > 0 && (
        <section>
          <h2 className="mono-section-title">COMPLEXITY HOTSPOTS</h2>
          <table className="mono-table">
            <thead>
              <tr className="bg-muted">
                <th className="type-label text-muted-foreground">FILE</th>
                <th className="text-right type-label text-muted-foreground">
                  LINES
                </th>
                <th className="text-right type-label text-muted-foreground">
                  SCORE
                </th>
              </tr>
            </thead>
            <tbody>
              {results.complexity.map((file, i) => (
                <tr key={i}>
                  <td className="type-body">{file.path}</td>
                  <td className="text-right type-caption text-muted-foreground">
                    {file.lines.toLocaleString()}
                  </td>
                  <td className="text-right">
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
        </section>
      )}

      {results.scanners && results.scanners.length > 0 && (
        <section>
          <h2 className="mono-section-title">SCANNER COVERAGE</h2>
          <div className="mono-grid-4">
            {results.scanners.map((scanner) => (
              <div
                key={scanner.name}
                className="flex items-center justify-between border border-border px-4 py-2"
              >
                <span className="type-caption text-muted-foreground">
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
    </>
  );
}
