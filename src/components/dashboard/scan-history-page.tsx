"use client";

import type { Scan } from "@prisma/client";
import { EmptyState } from "@fabrk/components";
import { Clock } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { UpgradeGate } from "@/components/shared/upgrade-gate";

type DiffValue = { value: number | null; delta: number | null };

function computeDiffs(scans: Scan[]): Map<string, { files: DiffValue; lines: DiffValue; components: DiffValue }> {
  const map = new Map<string, { files: DiffValue; lines: DiffValue; components: DiffValue }>();
  const completed = scans.filter((s) => s.status === "COMPLETED");

  for (let i = 0; i < completed.length; i++) {
    const curr = completed[i];
    const prev = completed[i + 1]; // scans are newest-first

    const diff = (curr: number | null, prev: number | null): DiffValue => ({
      value: curr,
      delta: curr != null && prev != null ? curr - prev : null,
    });

    map.set(curr.id, {
      files: diff(curr.fileCount, prev?.fileCount ?? null),
      lines: diff(curr.lineCount, prev?.lineCount ?? null),
      components: diff(curr.componentCount, prev?.componentCount ?? null),
    });
  }

  return map;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  const positive = delta > 0;
  return (
    <span className={`ml-[var(--grid-1)] text-[10px] font-mono ${positive ? "text-accent" : "text-destructive"}`}>
      {positive ? "+" : ""}{delta.toLocaleString()}
    </span>
  );
}

export function ScanHistoryPage({
  scans,
  plan,
}: {
  scans: Scan[];
  plan: string;
}) {
  if (plan === "FREE") {
    return (
      <UpgradeGate
        feature="SCAN HISTORY"
        description="Upgrade to Pro to see your codebase's evolution over time. Track file counts, component growth, and scan trends across every push."
        requiredPlan="PRO"
      />
    );
  }

  if (scans.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="NO SCAN HISTORY"
        description="Run a scan to see results here"
      />
    );
  }

  const diffs = computeDiffs(scans);

  return (
    <section>
      <h2 className="mono-section-title">SCAN HISTORY</h2>
      <table className="mono-table">
        <thead>
          <tr className="bg-muted">
            <th className="type-label text-muted-foreground">STATUS</th>
            <th className="type-label text-muted-foreground">DATE</th>
            <th className="text-right type-label text-muted-foreground">FILES</th>
            <th className="text-right type-label text-muted-foreground">LINES</th>
            <th className="text-right type-label text-muted-foreground">COMPONENTS</th>
            <th className="text-right type-label text-muted-foreground">DURATION</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => {
            const d = diffs.get(scan.id);
            return (
              <tr key={scan.id}>
                <td><StatusBadge status={scan.status} /></td>
                <td className="type-caption text-muted-foreground">
                  {new Date(scan.createdAt).toLocaleString()}
                  {scan.commitSha && (
                    <span className="ml-[var(--grid-2)] font-mono text-[10px] text-muted-foreground/50">
                      {scan.commitSha.slice(0, 7)}
                    </span>
                  )}
                </td>
                <td className="text-right type-body font-medium">
                  {d?.files.value?.toLocaleString() ?? scan.fileCount?.toLocaleString() ?? "—"}
                  <DeltaBadge delta={d?.files.delta ?? null} />
                </td>
                <td className="text-right type-body font-medium">
                  {d?.lines.value?.toLocaleString() ?? scan.lineCount?.toLocaleString() ?? "—"}
                  <DeltaBadge delta={d?.lines.delta ?? null} />
                </td>
                <td className="text-right type-body font-medium">
                  {d?.components.value?.toLocaleString() ?? scan.componentCount?.toLocaleString() ?? "—"}
                  <DeltaBadge delta={d?.components.delta ?? null} />
                </td>
                <td className="text-right type-caption text-muted-foreground">
                  {scan.duration ? `${(scan.duration / 1000).toFixed(1)}s` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {scans.length > 1 && (
        <p className="mt-[var(--grid-3)] type-caption text-muted-foreground">
          Deltas show change vs. previous completed scan.
        </p>
      )}
    </section>
  );
}
