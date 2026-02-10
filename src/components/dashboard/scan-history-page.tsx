"use client";

import type { Scan } from "@prisma/client";
import { EmptyState } from "@fabrk/components";
import { Clock } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { UpgradeGate } from "@/components/shared/upgrade-gate";

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

  return (
    <section>
      <h2 className="mono-section-title">
        SCAN HISTORY
      </h2>
      <table className="mono-table">
        <thead>
          <tr className="bg-muted">
            <th className="type-label text-muted-foreground">STATUS</th>
            <th className="type-label text-muted-foreground">DATE</th>
            <th className="text-right type-label text-muted-foreground">FILES</th>
            <th className="text-right type-label text-muted-foreground">LINES</th>
            <th className="text-right type-label text-muted-foreground">DURATION</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => (
            <tr key={scan.id}>
              <td><StatusBadge status={scan.status} /></td>
              <td className="type-caption text-muted-foreground">
                {new Date(scan.createdAt).toLocaleString()}
              </td>
              <td className="text-right type-body font-medium">
                {scan.fileCount?.toLocaleString() ?? "—"}
              </td>
              <td className="text-right type-body font-medium">
                {scan.lineCount?.toLocaleString() ?? "—"}
              </td>
              <td className="text-right type-caption text-muted-foreground">
                {scan.duration
                  ? `${(scan.duration / 1000).toFixed(1)}s`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
