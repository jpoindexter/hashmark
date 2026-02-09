"use client";

import { Button } from "@fabrk/components";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 mono-box border-destructive/50 bg-card">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="type-h3">
        [ERROR] FAILED TO LOAD DASHBOARD
      </h2>
      <p className="max-w-md text-center type-caption text-muted-foreground">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <Button onClick={reset}>{"> RETRY"}</Button>
    </div>
  );
}
