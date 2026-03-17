"use client";

import { StatsGrid, EmptyState } from "@fabrk/components";
import { Activity } from "lucide-react";
import { useMemo, useState } from "react";

interface FunctionRow {
  name: string;
  file: string;
  line: number;
  cyclomatic: number;
  cognitive: number;
  halstead: { volume: number; effort: number; estimatedBugs: number };
  maintainabilityIndex: number;
}

interface FileScoreRow {
  path: string;
  score: number;
  level: string;
  maintainabilityIndex?: number;
}

export interface ComplexityData {
  topFunctions: FunctionRow[];
  fileScores: FileScoreRow[];
}

type SortField = "cognitive" | "cyclomatic" | "maintainabilityIndex" | "effort";
type SortDir = "asc" | "desc";

function miColor(mi: number) {
  return mi >= 65 ? "text-success" : mi >= 20 ? "text-warning" : "text-destructive";
}

function LevelBadge({ level }: { level: string }) {
  const cls = level === "high"
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : level === "medium"
      ? "bg-warning/10 text-warning border-warning/30"
      : "bg-success/10 text-success border-success/30";
  return <span className={`inline-block border px-[var(--grid-2)] py-[var(--grid-1)] type-label ${cls}`}>{level}</span>;
}

function SortTh({ field, current, dir, onSort, children }: {
  field: SortField; current: SortField; dir: SortDir;
  onSort: (f: SortField) => void; children: React.ReactNode;
}) {
  const arrow = field === current ? (dir === "desc" ? " v" : " ^") : "";
  return (
    <th
      className="type-label text-muted-foreground text-right px-[var(--grid-4)] py-[var(--grid-3)] cursor-pointer hover:text-foreground"
      onClick={() => onSort(field)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSort(field)}
      aria-label={`Sort by ${field}`}
    >{children}{arrow}</th>
  );
}

export function ComplexityPage({ data, hasScan }: { data: ComplexityData | null; hasScan: boolean }) {
  const [sortField, setSortField] = useState<SortField>("cognitive");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedFunctions = useMemo(() => {
    const functions = data?.topFunctions ?? [];
    if (functions.length === 0) return [];
    return [...functions].sort((a, b) => {
      const get = (row: FunctionRow) => {
        switch (sortField) {
          case "cognitive": return row.cognitive;
          case "cyclomatic": return row.cyclomatic;
          case "maintainabilityIndex": return row.maintainabilityIndex;
          case "effort": return row.halstead.effort;
        }
      };
      return sortDir === "desc" ? get(b) - get(a) : get(a) - get(b);
    });
  }, [data?.topFunctions, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (field === sortField) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  if (!hasScan) {
    return <EmptyState icon={Activity} title="NO SCAN DATA" description="Run a scan to see complexity analysis with function-level metrics" />;
  }
  if (!data || (!data.topFunctions.length && !data.fileScores.length)) {
    return <EmptyState icon={Activity} title="NO COMPLEXITY DATA" description="Scan completed but no function-level complexity data was found" />;
  }

  const avgMI = data.fileScores.length > 0
    ? Math.round(data.fileScores.reduce((s, f) => s + (f.maintainabilityIndex ?? 0), 0) / data.fileScores.length)
    : 0;
  const hotspotCount = data.topFunctions.filter((f) => f.cognitive > 15).length;
  const estimatedBugs = data.topFunctions.reduce((s, f) => s + f.halstead.estimatedBugs, 0);

  return (
    <div className="mono-stack-lg">
      <StatsGrid
        items={[
          { label: "AVG MI SCORE", value: String(avgMI) },
          { label: "FUNCTIONS ANALYZED", value: String(data.topFunctions.length) },
          { label: "HOTSPOTS (COG>15)", value: String(hotspotCount) },
          { label: "EST. BUGS (HALSTEAD)", value: estimatedBugs.toFixed(1) },
        ]}
        columns={4}
      />

      {sortedFunctions.length > 0 && (
        <section>
          <h2 className="mono-section-title">FUNCTION HOTSPOTS</h2>
          <div className="overflow-x-auto border border-border">
            <table className="mono-table w-full">
              <thead>
                <tr className="bg-muted">
                  <th className="type-label text-muted-foreground text-left px-[var(--grid-4)] py-[var(--grid-3)]">FUNCTION</th>
                  <th className="type-label text-muted-foreground text-left px-[var(--grid-4)] py-[var(--grid-3)]">FILE</th>
                  <SortTh field="cyclomatic" current={sortField} dir={sortDir} onSort={handleSort}>CC</SortTh>
                  <SortTh field="cognitive" current={sortField} dir={sortDir} onSort={handleSort}>COGNITIVE</SortTh>
                  <SortTh field="maintainabilityIndex" current={sortField} dir={sortDir} onSort={handleSort}>MI</SortTh>
                  <SortTh field="effort" current={sortField} dir={sortDir} onSort={handleSort}>EFFORT</SortTh>
                </tr>
              </thead>
              <tbody>
                {sortedFunctions.map((fn, i) => (
                  <tr key={`${fn.file}-${fn.name}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] type-body text-foreground">{fn.name}</td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] type-caption text-muted-foreground">{fn.file}:{fn.line}</td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] text-right type-body">{fn.cyclomatic}</td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] text-right type-body">
                      <span className={fn.cognitive > 25 ? "text-destructive" : fn.cognitive > 10 ? "text-warning" : "text-success"}>
                        {fn.cognitive}
                      </span>
                    </td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] text-right type-body">
                      <span className={miColor(fn.maintainabilityIndex)}>{fn.maintainabilityIndex}</span>
                    </td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] text-right type-caption text-muted-foreground">
                      {fn.halstead.effort.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.fileScores.length > 0 && (
        <section>
          <h2 className="mono-section-title">FILE COMPLEXITY SCORES</h2>
          <div className="overflow-x-auto border border-border">
            <table className="mono-table w-full">
              <thead>
                <tr className="bg-muted">
                  <th className="type-label text-muted-foreground text-left px-[var(--grid-4)] py-[var(--grid-3)]">FILE</th>
                  <th className="type-label text-muted-foreground text-right px-[var(--grid-4)] py-[var(--grid-3)]">SCORE</th>
                  <th className="type-label text-muted-foreground text-center px-[var(--grid-4)] py-[var(--grid-3)]">LEVEL</th>
                  <th className="type-label text-muted-foreground text-right px-[var(--grid-4)] py-[var(--grid-3)]">MI</th>
                </tr>
              </thead>
              <tbody>
                {data.fileScores.map((f) => (
                  <tr key={f.path} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] type-caption text-muted-foreground">{f.path}</td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] text-right type-body">{f.score}/100</td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] text-center"><LevelBadge level={f.level} /></td>
                    <td className="px-[var(--grid-4)] py-[var(--grid-3)] text-right type-body">
                      {f.maintainabilityIndex != null
                        ? <span className={miColor(f.maintainabilityIndex)}>{f.maintainabilityIndex}</span>
                        : <span className="text-muted-foreground">--</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
