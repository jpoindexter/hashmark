"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;

/**
 * Polls /api/scan/[repoId]/latest when a scan is PENDING or SCANNING.
 * Calls router.refresh() when the scan transitions to COMPLETED or FAILED,
 * causing the server component to re-fetch fresh data.
 */
export function useScanPolling(
  repoId: string,
  scanStatus: string | null | undefined
) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/scan/${repoId}/latest`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const scan = await res.json();
        if (
          scan &&
          scan.status !== "PENDING" &&
          scan.status !== "SCANNING"
        ) {
          stopPolling();
          router.refresh();
        }
      } catch {
        // Silently ignore polling errors — will retry on next interval
      }
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return stopPolling;
  }, [repoId, isPolling, router, stopPolling]);
}
