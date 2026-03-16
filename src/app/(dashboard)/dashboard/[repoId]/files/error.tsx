"use client";

import { Button } from "@fabrk/components";
import { AlertTriangle } from "lucide-react";

export default function FilesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-[var(--grid-4)] mono-box border-destructive/50 bg-card">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="type-h3">[ERROR] FAILED TO LOAD FILES</h2>
      <p className="type-caption text-muted-foreground">Could not load generated files. Please try again.</p>
      <Button onClick={reset}>{"> RETRY"}</Button>
    </div>
  );
}
