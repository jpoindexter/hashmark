"use client";

import Link from "next/link";
import { Button } from "@fabrk/components";
import { Lock } from "lucide-react";

interface UpgradeGateProps {
  feature: string;
  description: string;
  requiredPlan: "PRO" | "TEAM";
  children?: React.ReactNode;
}

/**
 * Wraps a feature section with a plan gate.
 * If children are provided, they render blurred behind the gate overlay.
 * Otherwise, shows a standalone upgrade prompt.
 */
export function UpgradeGate({
  feature,
  description,
  requiredPlan,
  children,
}: UpgradeGateProps) {
  return (
    <div className="relative">
      {children && (
        <div
          className="pointer-events-none select-none blur-sm"
          aria-hidden="true"
        >
          {children}
        </div>
      )}

      <div
        className={`${children ? "absolute inset-0" : ""} flex flex-col items-center justify-center gap-4 mono-box bg-card/95`}
      >
        <div className="flex h-12 w-12 items-center justify-center border border-border bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="type-h3">
          {feature}
        </h3>
        <p className="max-w-sm text-center type-caption text-muted-foreground">
          {description}
        </p>
        <Button asChild>
          <Link href="/dashboard/billing">
            {`> UPGRADE TO ${requiredPlan}`}
          </Link>
        </Button>
      </div>
    </div>
  );
}
