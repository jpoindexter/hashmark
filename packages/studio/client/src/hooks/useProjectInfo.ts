import { useState, useEffect, useRef, useCallback } from "react";

export interface ProjectInfo {
  projectName: string;
  projectDir: string;
}

export interface GitStatus {
  branch: string;
  files: { status: string }[];
}

export type DriftLevel = "none" | "minor" | "major";

export interface DriftSignal {
  type: "file_count_delta" | "age_days" | "commit_mismatch";
  current?: number;
  baseline?: number;
  delta?: number;
  days?: number;
  fileCommit?: string;
  headCommit?: string;
}

export interface DriftResult {
  hasContextFile: true;
  fileName: string;
  driftLevel: DriftLevel;
  signals: DriftSignal[];
  recommendation: string;
}

export interface NoDriftResult {
  hasContextFile: false;
}

export type DriftResponse = DriftResult | NoDriftResult;

interface UseProjectInfoReturn {
  info: ProjectInfo | null;
  git: GitStatus | null;
  drift: DriftResult | null;
  changedFiles: number;
  refreshGit: () => void;
}

/**
 * Fetches project info, git status, and drift state on mount.
 * Polls git status every 3s while streaming is active.
 * When streaming stops and files have changed, signals via diffShouldOpen.
 */
export function useProjectInfo(
  streaming: boolean,
  onDiffShouldOpen?: () => void,
): UseProjectInfoReturn {
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [drift, setDrift] = useState<DriftResult | null>(null);

  // Fetch info, git, and drift on mount
  useEffect(() => {
    fetch("/api/info")
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {});
    fetch("/api/files/git")
      .then(r => r.json())
      .then(setGit)
      .catch(() => {});
    fetch("/api/drift/check")
      .then(r => r.json())
      .then((d: DriftResponse) => {
        if (d.hasContextFile && d.driftLevel !== "none") setDrift(d);
      })
      .catch(() => {});
  }, []);

  // Poll git status during streaming; auto-open diff drawer when streaming stops
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (!streaming) {
      fetch("/api/files/git")
        .then(r => r.json())
        .then((data: GitStatus) => {
          setGit(data);
          if (prevStreamingRef.current && (data.files?.length ?? 0) > 0) {
            onDiffShouldOpen?.();
          }
        })
        .catch(() => {});
      prevStreamingRef.current = false;
      return;
    }
    prevStreamingRef.current = true;
    const id = setInterval(() => {
      fetch("/api/files/git")
        .then(r => r.json())
        .then((data: GitStatus) => setGit(data))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [streaming, onDiffShouldOpen]);

  const refreshGit = useCallback(() => {
    fetch("/api/files/git")
      .then(r => r.json())
      .then(setGit)
      .catch(() => {});
  }, []);

  const changedFiles = git?.files?.length ?? 0;

  return { info, git, drift, changedFiles, refreshGit };
}
