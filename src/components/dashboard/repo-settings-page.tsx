"use client";

import { useState, useTransition } from "react";
import { updateRepoScanRoot } from "@/app/(dashboard)/dashboard/[repoId]/actions";
import { Input, Button } from "@fabrk/components";

export function RepoSettingsPage({
  repoId,
  repoName,
  scanRoot,
}: {
  repoId: string;
  repoName: string;
  scanRoot: string | null;
}) {
  const [value, setValue] = useState(scanRoot ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const trimmed = value.trim();

    // Client-side validation: no path traversal, no absolute paths
    if (trimmed.includes("..") || trimmed.startsWith("/")) {
      setError("Invalid path. Must be a relative path without '..' segments.");
      return;
    }

    const formData = new FormData();
    formData.set("repoId", repoId);
    formData.set("scanRoot", trimmed);

    startTransition(async () => {
      try {
        await updateRepoScanRoot(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update scan root"
        );
      }
    });
  }

  return (
    <div className="mono-stack-lg">
      <section>
        <h2 className="mono-section-title text-muted-foreground">
          SCAN CONFIGURATION
        </h2>
        <div className="mono-box bg-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="scanRoot"
                className="type-caption font-bold uppercase text-muted-foreground"
              >
                SCAN ROOT
              </label>
              <p className="type-caption text-muted-foreground mt-[var(--grid-1)]">
                Subdirectory to scan within{" "}
                <span className="text-foreground font-bold">{repoName}</span>.
                Leave empty to auto-detect.
              </p>
              <div className="mt-[var(--grid-2)] flex items-center gap-[var(--grid-3)]">
                <Input
                  id="scanRoot"
                  name="scanRoot"
                  type="text"
                  value={value}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                  placeholder="e.g., web, apps/frontend, packages/api"
                  className="flex-1 border border-border bg-background px-[var(--grid-3)] py-[var(--grid-2)] type-body text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none"
                  aria-describedby="scanRoot-help"
                />
                <Button
                  type="submit"
                  disabled={isPending}
                  className="border border-border bg-background px-[var(--grid-4)] py-[var(--grid-2)] type-nav text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {isPending ? "SAVING..." : "> SAVE"}
                </Button>
              </div>
              <p id="scanRoot-help" className="mt-[var(--grid-1)] type-caption text-muted-foreground">
                {value.trim() === "" ? (
                  <span className="text-accent">AUTO-DETECT</span>
                ) : (
                  <>
                    Scanner will target:{" "}
                    <span className="text-foreground font-bold">
                      {repoName}/{value.trim()}
                    </span>
                  </>
                )}
              </p>
            </div>

            {error && (
              <p className="type-caption text-destructive" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="type-caption text-accent" role="status">
                Scan root updated. Next scan will use the new path.
              </p>
            )}
          </form>
        </div>
      </section>

      <section>
        <h2 className="mono-section-title text-muted-foreground">
          ABOUT SCAN ROOT
        </h2>
        <div className="mono-box bg-card space-y-3">
          <p className="type-caption text-muted-foreground">
            For monorepos, set the scan root to the subdirectory containing your
            primary application. This tells the scanner where to look for
            components, hooks, API routes, and framework configuration.
          </p>
          <div className="space-y-1 type-caption text-muted-foreground">
            <p className="text-foreground font-bold">EXAMPLES:</p>
            <p>
              <span className="text-accent">web</span> — Turborepo/Nx with a
              web app at <code>web/</code>
            </p>
            <p>
              <span className="text-accent">apps/frontend</span> — Nx-style
              monorepo with apps in <code>apps/</code>
            </p>
            <p>
              <span className="text-accent">packages/api</span> — Target a
              specific package for scanning
            </p>
          </div>
          <p className="type-caption text-muted-foreground">
            When left empty, the scanner auto-detects the best candidate by
            looking for framework config files (package.json, go.mod,
            Cargo.toml, etc.) and scoring subdirectories by code structure.
          </p>
        </div>
      </section>
    </div>
  );
}
