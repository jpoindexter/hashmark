"use client";

import { Button } from "@fabrk/components";
import { AlertTriangle } from "lucide-react";

export default function SettingsError({
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
        [ERROR] FAILED TO LOAD SETTINGS
      </h2>
      <p className="max-w-md text-center type-caption text-muted-foreground">
        {error.message || "Could not load your settings. Please try again."}
      </p>
      <Button onClick={reset}>{"> RETRY"}</Button>
    </div>
  );
}
