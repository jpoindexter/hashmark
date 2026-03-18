"use client";

import { useReducer, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@fabrk/components";
import { PatchDiff } from "@pierre/diffs/react";

interface PatchEntry {
  fileName: string;
  patch: string;
}

interface DiffResult {
  fromDate: string;
  toDate: string;
  patches: PatchEntry[];
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; result: DiffResult };

function reducer(_prev: State, next: State): State {
  return next;
}

interface ScanDiffModalProps {
  repoId: string;
  fromScanId: string;
  toScanId: string;
  fromLabel: string;
  toLabel: string;
  onClose: () => void;
}

export function ScanDiffModal({
  repoId,
  fromScanId,
  toScanId,
  fromLabel,
  toLabel,
  onClose,
}: ScanDiffModalProps) {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scan/${repoId}/diff?from=${fromScanId}&to=${toScanId}`)
      .then(r => r.json())
      .then((d: DiffResult & { error?: string }) => {
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        dispatch({ status: "ok", result: d });
      })
      .catch((e: unknown) => {
        if (!cancelled) dispatch({ status: "error", message: (e as Error).message });
      });
    return () => { cancelled = true; };
  }, [repoId, fromScanId, toScanId]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto py-10 px-4 bg-on-surface/60"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl bg-background border border-border rounded-lg flex-shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="type-label text-muted-foreground">DIFF</span>
            <span className="type-caption text-muted-foreground">{fromLabel}</span>
            <span className="type-caption text-muted-foreground">→</span>
            <span className="type-caption">{toLabel}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close diff modal">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-5">
          {state.status === "loading" && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <span className="type-caption">Computing diff...</span>
            </div>
          )}

          {state.status === "error" && (
            <div className="py-8 text-center type-caption text-destructive">
              {state.message}
            </div>
          )}

          {state.status === "ok" && state.result.patches.length === 0 && (
            <div className="py-8 text-center type-caption text-muted-foreground">
              No changes between these scans.
            </div>
          )}

          {state.status === "ok" && state.result.patches.length > 0 && (
            <div className="flex flex-col gap-6">
              {state.result.patches.map(({ fileName, patch }) => (
                <div key={fileName}>
                  <p className="mb-2 type-label text-muted-foreground">{fileName}</p>
                  <PatchDiff
                    patch={patch}
                    options={{ theme: "github-dark", diffStyle: "split" }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
