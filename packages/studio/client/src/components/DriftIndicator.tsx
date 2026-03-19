import { useState, useEffect, useRef, type CSSProperties } from "react";
import { AlertTriangle } from "lucide-react";

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

export interface NoDriftResult { hasContextFile: false; }

export type DriftResponse = DriftResult | NoDriftResult;

export function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem("studio:drift_dismissed_until");
    if (!raw) return false;
    return Date.now() < parseInt(raw, 10);
  } catch { return false; }
}

export function dismissFor24h() {
  try { localStorage.setItem("studio:drift_dismissed_until", String(Date.now() + 86400000)); } catch {}
}

function signalLabel(s: DriftSignal): string {
  if (s.type === "age_days") return `Age: ${s.days ?? "?"} days old`;
  if (s.type === "commit_mismatch") return `Commit mismatch: ${(s.fileCommit ?? "?").slice(0, 7)} vs ${(s.headCommit ?? "?").slice(0, 7)}`;
  if (s.type === "file_count_delta") return `File count delta: ${s.delta != null ? (s.delta > 0 ? "+" : "") + s.delta : "?"}`;
  return s.type;
}

export function DriftBadge({ drift, navigate }: { drift: DriftResult; navigate: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMajor = drift.driftLevel === "major";
  const dotColor = isMajor ? "var(--red)" : "var(--yellow)";
  const tooltipText = isMajor
    ? "Context is significantly stale"
    : "Context is slightly stale — consider rescanning";

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? undefined : tooltipText}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
            animation: isMajor ? "drift-pulse 1.4s ease-in-out infinite" : "none",
          } as CSSProperties}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "var(--bg-4)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            width: 220,
            fontSize: 11,
            fontFamily: "var(--font-ui)",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "8px 10px 6px",
            borderBottom: "1px solid var(--border-dim)",
            color: dotColor,
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: "0.06em",
          }}>
            {isMajor ? "CONTEXT SIGNIFICANTLY STALE" : "CONTEXT SLIGHTLY STALE"}
          </div>

          {/* Signals */}
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-dim)" }}>
            {drift.signals.map((s, i) => (
              <div key={i} style={{ color: "var(--text-dim)", marginBottom: i < drift.signals.length - 1 ? 3 : 0 }}>
                · {signalLabel(s)}
              </div>
            ))}
          </div>

          {/* Recommendation */}
          <div style={{ padding: "6px 10px 8px", color: "var(--text-dimmer)", borderBottom: "1px solid var(--border-dim)" }}>
            {drift.recommendation}
          </div>

          {/* Rescan button */}
          <div style={{ padding: "6px 10px" }}>
            <button
              onClick={() => { setOpen(false); navigate("/generate"); }}
              style={{
                width: "100%",
                background: "var(--bg-3)",
                border: `1px solid ${dotColor}`,
                color: dotColor,
                padding: "4px 8px",
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                cursor: "pointer",
                borderRadius: 0,
                textAlign: "center",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = isMajor ? "rgba(248,81,73,0.1)" : "rgba(210,153,34,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-3)")}
            >
              Rescan now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DriftBanner({ drift, onDismiss }: { drift: DriftResult; onDismiss: () => void }) {
  const isMajor = drift.driftLevel === "major";
  const accentColor = isMajor ? "var(--red)" : "var(--yellow)";
  const bgColor = isMajor ? "var(--red-bg)" : "var(--yellow-bg)";
  const borderColor = isMajor ? "var(--red)" : "var(--yellow)";
  const signalCount = drift.signals.length;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 14px",
      background: bgColor,
      borderBottom: `1px solid ${borderColor}`,
      flexShrink: 0,
      fontSize: 11,
      fontFamily: "var(--font-ui)",
    }}>
      <AlertTriangle size={13} style={{ color: accentColor, flexShrink: 0 }} />
      <span style={{ color: "var(--text-dim)", flex: 1 }}>
        <span style={{ color: accentColor, fontWeight: 600 }}>{drift.fileName}</span>
        {" "}may be stale — {signalCount} signal{signalCount !== 1 ? "s" : ""}.{" "}
        {drift.recommendation}
      </span>
      <a
        href="/generate"
        onClick={() => { window.location.href = "/generate"; }}
        style={{
          color: accentColor, textDecoration: "none", fontWeight: 600,
          padding: "2px 8px", border: `1px solid ${borderColor}`,
          borderRadius: 3, whiteSpace: "nowrap", cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = bgColor}
        onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = "transparent"}
      >
        Regenerate
      </a>
      <button
        onClick={onDismiss}
        title="Dismiss for 24h"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-dimmer)", fontSize: 14, padding: "0 4px",
          lineHeight: 1, flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
