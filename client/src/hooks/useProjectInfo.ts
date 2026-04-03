import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./useToast";

export interface ProjectInfo {
  projectName: string;
  projectDir: string;
}

export interface GitFile {
  status: string;
  file: string;
}

export interface GitStatus {
  branch: string;
  files: GitFile[];
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

  const fetchAll = useCallback(() => {
    fetchApi("/api/status")
      .then(r => r.json())
      .then((data: { info: ProjectInfo; git: GitStatus; drift: DriftResponse }) => {
        setInfo(data.info);
        setGit(data.git);
        const d = data.drift;
        if (d.hasContextFile && d.driftLevel !== "none") setDrift(d);
        else setDrift(null);
      })
      .catch(() => {
        toast.error("Failed to load project status");
      });
  }, []);

  // Fetch info, git, and drift on mount
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Re-fetch everything when branch changes (soft refresh)
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener("studio:branch-changed", handler);
    return () => window.removeEventListener("studio:branch-changed", handler);
  }, [fetchAll]);

  // Poll git status during streaming; auto-open diff drawer when streaming stops
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (!streaming) {
      const wasStreaming = prevStreamingRef.current;
      prevStreamingRef.current = false;
      fetchApi("/api/files/git")
        .then(r => r.json())
        .then((data: GitStatus) => {
          setGit(data);
          if (wasStreaming && (data.files?.length ?? 0) > 0) {
            onDiffShouldOpen?.();
          }
        })
        .catch(() => {});
      return;
    }
    prevStreamingRef.current = true;
    const id = setInterval(() => {
      fetchApi("/api/files/git")
        .then(r => r.json())
        .then((data: GitStatus) => setGit(data))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [streaming, onDiffShouldOpen]);

  const refreshGit = useCallback(() => {
    fetchApi("/api/files/git")
      .then(r => r.json())
      .then(setGit)
      .catch(() => {});
  }, []);

  const changedFiles = git?.files?.length ?? 0;

  return { info, git, drift, changedFiles, refreshGit };
}
