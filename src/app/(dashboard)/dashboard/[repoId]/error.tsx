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
    <div className="flex flex-col items-center justify-center gap-4 border border-destructive/50 bg-card px-8 py-16">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-sm font-bold uppercase tracking-wider">
        [ERROR] FAILED TO LOAD REPOSITORY
      </h2>
      <p className="max-w-md text-center text-xs text-muted-foreground">
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
