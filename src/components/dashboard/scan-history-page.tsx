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
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider">
        [ SCAN HISTORY ]
      </h2>
      <div className="border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                STATUS
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                DATE
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                FILES
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                LINES
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                DURATION
              </th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={scan.id} className="border-b border-border last:border-0">
                <td className="px-6 py-4">
                  <StatusBadge status={scan.status} />
                </td>
                <td className="px-6 py-4 text-xs text-muted-foreground">
                  {new Date(scan.createdAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium">
                  {scan.fileCount?.toLocaleString() ?? "—"}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium">
                  {scan.lineCount?.toLocaleString() ?? "—"}
                </td>
                <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                  {scan.duration
                    ? `${(scan.duration / 1000).toFixed(1)}s`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
