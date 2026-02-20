"use client";

import { useEffect } from "react";
import { Button } from "@fabrk/components";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-[var(--grid-6)]">
      <div className="flex flex-col items-center gap-[var(--grid-4)] mono-box border-destructive bg-destructive/5 text-center max-w-md">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="type-h2 text-destructive">[SYSTEM_ERROR]</h2>
        <p className="type-body text-muted-foreground">
          An unexpected error occurred while loading the dashboard. This might be a transient network issue.
        </p>
        {error.digest && (
          <code className="type-caption bg-background border border-border px-2 py-1">
            DIGEST: {error.digest}
          </code>
        )}
        <div className="mt-[var(--grid-4)] flex gap-[var(--grid-4)]">
          <Button onClick={() => reset()} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" />
            {"> RETRY"}
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              {"> BACK TO HOME"}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
