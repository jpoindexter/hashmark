"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface ScanProgress {
  step: string;
  detail?: string;
}

/**
 * Streams scan progress via SSE from /api/scan/[repoId]/stream.
 * Replaces useScanPolling for a more responsive "Live Terminal" experience.
 */
export function useScanStream(
  repoId: string,
  scanStatus: string | null | undefined
) {
  const router = useRouter();
  const isStreaming = scanStatus === "PENDING" || scanStatus === "SCANNING";
  
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    const eventSource = new EventSource(`/api/scan/${repoId}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.progress) {
        setProgress(data.progress);
      }

      // If the scan finished, refresh the page to show results
      if (data.status === "COMPLETED" || data.status === "FAILED") {
        eventSource.close();
        router.refresh();
      }
    };

    eventSource.onerror = () => {
      // SSE auto-reconnect handles it
    };

    return () => {
      eventSource.close();
    };
  }, [repoId, isStreaming, router]);

  // Derived state: only show progress if we are actually streaming.
  // We use a fallback initial step if progress is not yet received from the stream.
  if (!isStreaming) return null;
  return progress || { step: "CONNECTING", detail: "Establishing stream..." };
}
