"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;

export interface ScanProgress {
  step: string;
  detail?: string;
}

/**
 * Polls /api/scan/[repoId]/latest when a scan is PENDING or SCANNING.
 * Returns live progress info from the scan worker.
 * Calls router.refresh() when the scan transitions to COMPLETED or FAILED.
 */
export function useScanPolling(
  repoId: string,
  scanStatus: string | null | undefined
) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const isPolling = scanStatus === "PENDING" || scanStatus === "SCANNING";

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPolling) {
      stopPolling();
      // Reset progress when polling stops — intentional state sync on dependency change
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(null);
      return;
    }

    // Set initial progress for PENDING
    if (scanStatus === "PENDING") {
      setProgress({ step: "QUEUED", detail: "Waiting to start..." });
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/scan/${repoId}/latest`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const scan = await res.json();
        if (!scan) return;

        if (scan.status === "SCANNING" && scan.results?.progress) {
          setProgress(scan.results.progress);
        }

        if (scan.status !== "PENDING" && scan.status !== "SCANNING") {
          stopPolling();
          setProgress(null);
          router.refresh();
        }
      } catch {
        // Silently ignore polling errors — will retry on next interval
      }
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return stopPolling;
  }, [repoId, isPolling, scanStatus, router, stopPolling]);

  return progress;
}
