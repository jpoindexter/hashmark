"use client";

import { Badge } from "@fabrk/components";
import {
  type ScanResults,
  LatentHooksSection,
  PatternsSection,
  AiReadinessSection,
  ScannerCoverageSection,
} from "./scan-results-tables-parts";

export type { ScanResults };

function ComponentsTable({
  components,
}: {
  components: NonNullable<ScanResults["components"]>;
}) {
  return (
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
          {components.map((comp, i) => (
            <tr key={i}>
              <td className="type-body font-medium">{comp.name}</td>
              <td className="type-caption text-muted-foreground">{comp.path}</td>
              <td className="type-caption text-muted-foreground">
                {comp.category ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ApiRoutesTable({
  routes,
}: {
  routes: NonNullable<ScanResults["apiRoutes"]>;
}) {
  return (
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
          {routes.map((route, i) => (
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
  );
}

function ComplexityHotspotsTable({
  complexity,
}: {
  complexity: NonNullable<ScanResults["complexity"]>;
}) {
  return (
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
          {complexity.map((file, i) => (
            <tr key={i}>
              <td className="type-body">{file.path}</td>
              <td className="text-right type-caption text-muted-foreground">
                {file.lines.toLocaleString()}
              </td>
              <td className="text-right">
                <span
                  className={`type-label ${
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
  );
}

export function ScanResultsTables({ results }: { results: ScanResults }) {
  return (
    <>
      {results.aiReadiness && <AiReadinessSection score={results.aiReadiness} />}

      <div className="mono-grid-2">
        {results.latentHooks && results.latentHooks.length > 0 && (
          <LatentHooksSection hooks={results.latentHooks} />
        )}
        {results.patterns && results.patterns.length > 0 && (
          <PatternsSection patterns={results.patterns} />
        )}
      </div>

      {results.components && results.components.length > 0 && (
        <ComponentsTable components={results.components} />
      )}

      {results.apiRoutes && results.apiRoutes.length > 0 && (
        <ApiRoutesTable routes={results.apiRoutes} />
      )}

      {results.complexity && results.complexity.length > 0 && (
        <ComplexityHotspotsTable complexity={results.complexity} />
      )}

      {results.scanners && results.scanners.length > 0 && (
        <ScannerCoverageSection scanners={results.scanners} />
      )}
    </>
  );
}
