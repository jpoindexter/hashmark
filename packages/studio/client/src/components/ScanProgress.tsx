import { useEffect, useRef, useState } from "react";

interface ScanProgressProps {
  onComplete: (result: ScanResult) => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

export interface ScanResult {
  fileCount?: number;
  lineCount?: number;
  [key: string]: unknown;
}

interface ProgressLine {
  text: string;
  done: boolean;
}

export default function ScanProgress({ onComplete, onError, onCancel }: ScanProgressProps) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [status, setStatus] = useState("Starting scan...");
  const [finished, setFinished] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const run = async () => {
      let res: Response;
      try {
        res = await fetch("/api/scan", { method: "POST" });
      } catch (e) {
        onError(e instanceof Error ? e.message : "Failed to connect");
        return;
      }

      if (!res.ok || !res.body) {
        onError("Scan request failed");
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (!cancelledRef.current) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";

        for (const line of parts) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let evt: { type: string; message?: string; result?: ScanResult | null };
          try { evt = JSON.parse(raw); } catch { continue; }

          if (evt.type === "start") {
            setStatus(evt.message ?? "Starting...");
          } else if (evt.type === "progress") {
            const msg = evt.message ?? "";
            setStatus(msg);
            setLines(prev => {
              const updated = prev.map(l => ({ ...l, done: true }));
              return [...updated, { text: msg, done: false }];
            });
          } else if (evt.type === "complete") {
            setFinished(true);
            onComplete(evt.result ?? {});
            return;
          } else if (evt.type === "error") {
            setFinished(true);
            onError(evt.message ?? "Unknown scan error");
            return;
          }
        }
      }
    };

    void run();
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [lines]);

  const visibleLines = lines.slice(-20);

  return (
    <div style={{
      padding: "32px",
      maxWidth: "720px",
      fontFamily: "var(--font)",
      animation: "fadeIn 0.2s ease forwards",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontWeight: 700,
            color: "var(--accent)",
          }}>
            {finished ? "Done" : "Scanning..."}
          </span>
          {!finished && <span className="cursor" />}
        </div>
        {!finished && (
          <button
            className="btn"
            onClick={onCancel}
            style={{ fontSize: "11px", color: "var(--red)", borderColor: "var(--red-bg)" }}
          >
            ■ Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        height: 4,
        background: "var(--border-dim)",
        borderRadius: "var(--radius)",
        marginBottom: "8px",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          background: finished ? "var(--accent-dim)" : "var(--accent)",
          width: finished ? "100%" : "60%",
          transition: "width 0.4s ease",
          animation: finished ? "none" : "scanIndeterminate 1.6s ease-in-out infinite",
        }} />
      </div>

      {/* Status line */}
      <div style={{
        fontSize: "11px",
        color: "var(--text-dimmer)",
        marginBottom: "20px",
        minHeight: "16px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {status}
      </div>

      {/* File list */}
      {lines.length > 0 && (
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
        }}>
          <div style={{
            padding: "6px 12px",
            borderBottom: "1px solid var(--border-dim)",
            fontSize: "10px",
            color: "var(--text-dimmer)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}>
            Output
          </div>
          <div
            ref={listRef}
            style={{
              maxHeight: "320px",
              overflowY: "auto",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            }}
          >
            {visibleLines.map((l, i) => (
              <div key={i} style={{
                fontSize: "11px",
                fontFamily: "var(--font)",
                color: l.done ? "var(--accent)" : "var(--text)",
                display: "flex",
                alignItems: "baseline",
                gap: "8px",
              }}>
                <span style={{ color: l.done ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }}>
                  {l.done ? "✓" : "→"}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanIndeterminate {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { transform: translateX(150%); width: 40%; }
          100% { transform: translateX(150%); width: 40%; }
        }
      `}</style>
    </div>
  );
}
