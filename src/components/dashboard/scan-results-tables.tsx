"use client";

import { Badge } from "@fabrk/components";
import { Zap, Terminal } from "lucide-react";

export interface ScanResults {
  components?: Array<{ name: string; path: string; category?: string }>;
  apiRoutes?: Array<{ path: string; method: string; auth?: boolean }>;
  complexity?: Array<{ path: string; score: number; lines: number }>;
  scanners?: Array<{ name: string; found: number }>;
  patterns?: string[];
  latentHooks?: Array<{
    event: string;
    command: string;
    description?: string;
    pattern?: string;
  }>;
  importGraph?: {
    hubFiles: Array<{ file: string; importedByCount: number }>;
  };
  securityAudit?: {
    vulnerabilities: {
      critical: number;
      high: number;
      moderate: number;
    };
  };
}

function LatentHooksSection({ hooks }: { hooks: NonNullable<ScanResults["latentHooks"]> }) {
  return (
    <section>
      <h2 className="mono-section-title text-muted-foreground">AI AUTOMATION HOOKS</h2>
      <div className="mono-stack">
        {hooks.map((hook, i) => (
          <div key={i} className="mono-box bg-card">
            <div className="flex items-center gap-[var(--grid-2)]">
              <Zap className="h-3 w-3 text-accent" />
              <span className="type-label text-accent">{hook.event}</span>
            </div>
            <code className="mt-[var(--grid-2)] block border border-border bg-background px-[var(--grid-2)] py-1 type-caption text-foreground">
              {hook.command}
            </code>
            {hook.description && (
              <p className="mt-[var(--grid-2)] type-caption text-muted-foreground">
                {hook.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function PatternsSection({ patterns }: { patterns: string[] }) {
  return (
    <section>
      <h2 className="mono-section-title text-muted-foreground">DETECTED PATTERNS</h2>
      <div className="mono-stack">
        {patterns.map((pattern, i) => (
          <div key={i} className="flex items-center gap-[var(--grid-3)] mono-box bg-card">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="type-body">{pattern}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComponentsTable({ components }: { components: NonNullable<ScanResults["components"]> }) {
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
              <td className="type-caption text-muted-foreground">{comp.category ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ApiRoutesTable({ routes }: { routes: NonNullable<ScanResults["apiRoutes"]> }) {
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
              <td><Badge variant="outline">{route.method}</Badge></td>
              <td className="type-body">{route.path}</td>
              <td className="type-caption text-muted-foreground">{route.auth ? "YES" : "NO"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ComplexityHotspotsTable({ complexity }: { complexity: NonNullable<ScanResults["complexity"]> }) {
  return (
    <section>
      <h2 className="mono-section-title">COMPLEXITY HOTSPOTS</h2>
      <table className="mono-table">
        <thead>
          <tr className="bg-muted">
            <th className="type-label text-muted-foreground">FILE</th>
            <th className="text-right type-label text-muted-foreground">LINES</th>
            <th className="text-right type-label text-muted-foreground">SCORE</th>
          </tr>
        </thead>
        <tbody>
          {complexity.map((file, i) => (
            <tr key={i}>
              <td className="type-body">{file.path}</td>
              <td className="text-right type-caption text-muted-foreground">{file.lines.toLocaleString()}</td>
              <td className="text-right">
                <span className={`text-xs font-bold ${file.score >= 70 ? "text-destructive" : file.score >= 40 ? "text-warning" : "text-accent"}`}>
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

function ScannerCoverageSection({ scanners }: { scanners: NonNullable<ScanResults["scanners"]> }) {
  return (
    <section>
      <h2 className="mono-section-title">SCANNER COVERAGE</h2>
      <div className="mono-grid-4">
        {scanners.map((scanner) => (
          <div key={scanner.name} className="flex items-center justify-between border border-border px-[var(--grid-4)] py-[var(--grid-2)]">
            <span className="type-caption text-muted-foreground">{scanner.name}</span>
            <span className={`text-xs font-bold ${scanner.found > 0 ? "text-accent" : "text-muted-foreground"}`}>
              {scanner.found}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScanResultsTables({ results }: { results: ScanResults }) {
  return (
    <>
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
