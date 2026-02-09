"use client";

import { Button } from "@fabrk/components";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function RepoError({
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
        [ERROR] FAILED TO LOAD REPOSITORY
      </h2>
      <p className="max-w-md text-center type-caption text-muted-foreground">
        {error.message || "Could not load repository data. Please try again."}
      </p>
      <div className="flex gap-4">
        <Button onClick={reset}>{"> RETRY"}</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/repos">{"> BACK TO REPOS"}</Link>
        </Button>
      </div>
    </div>
  );
}
