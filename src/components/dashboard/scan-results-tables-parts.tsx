"use client";

import { Zap, Terminal, Sparkles } from "lucide-react";

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
  aiReadiness?: {
    total: number;
    breakdown: {
      documentation: number;
      typeSafety: number;
      modularization: number;
      testing: number;
      context: number;
    };
    recommendations: string[];
  };
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

export function LatentHooksSection({
  hooks,
}: {
  hooks: NonNullable<ScanResults["latentHooks"]>;
}) {
  return (
    <section>
      <h2 className="mono-section-title text-muted-foreground">
        AI AUTOMATION HOOKS
      </h2>
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

export function PatternsSection({ patterns }: { patterns: string[] }) {
  return (
    <section>
      <h2 className="mono-section-title text-muted-foreground">
        DETECTED PATTERNS
      </h2>
      <div className="mono-stack">
        {patterns.map((pattern, i) => (
          <div
            key={i}
            className="flex items-center gap-[var(--grid-3)] mono-box bg-card"
          >
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="type-body">{pattern}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AiReadinessSection({
  score,
}: {
  score: NonNullable<ScanResults["aiReadiness"]>;
}) {
  const getScoreColor = (val: number) => {
    if (val >= 80) return "text-accent";
    if (val >= 50) return "text-warning";
    return "text-destructive";
  };

  return (
    <section>
      <h2 className="mono-section-title text-muted-foreground flex items-center gap-2">
        <Sparkles className="h-3 w-3" /> AI READINESS SCORE
      </h2>
      <div className="mono-box bg-card">
        <div className="flex flex-col md:flex-row gap-[var(--grid-8)]">
          <div className="flex flex-col items-center justify-center border-r border-border pr-[var(--grid-8)] min-w-[120px]">
            <span className={`text-5xl font-black ${getScoreColor(score.total)}`}>
              {score.total}
            </span>
            <span className="type-label text-muted-foreground">READY</span>
          </div>

          <div className="flex-1 space-y-[var(--grid-4)]">
            <div className="grid grid-cols-2 gap-x-[var(--grid-8)] gap-y-[var(--grid-2)]">
              {Object.entries(score.breakdown).map(([key, val]) => (
                <div
                  key={key}
                  className="flex justify-between items-center border-b border-border/50 pb-1"
                >
                  <span className="type-caption uppercase text-muted-foreground">
                    {key}
                  </span>
                  <span className="type-body font-bold">{val}/20</span>
                </div>
              ))}
            </div>

            {score.recommendations.length > 0 && (
              <div className="mt-[var(--grid-4)]">
                <p className="type-label text-accent mb-2">RECOMMENDATIONS:</p>
                <ul className="space-y-1">
                  {score.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="type-caption text-muted-foreground flex gap-2"
                    >
                      <span>&gt;</span> {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ScannerCoverageSection({
  scanners,
}: {
  scanners: NonNullable<ScanResults["scanners"]>;
}) {
  return (
    <section>
      <h2 className="mono-section-title">SCANNER COVERAGE</h2>
      <div className="mono-grid-4">
        {scanners.map((scanner) => (
          <div
            key={scanner.name}
            className="flex items-center justify-between border border-border px-[var(--grid-4)] py-[var(--grid-2)]"
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
  );
}
