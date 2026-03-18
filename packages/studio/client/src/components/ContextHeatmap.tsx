import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SectionHit {
  heading: string;
  hitCount: number;
  lastHitAt: number;
}

interface SessionAnalytics {
  sessionId: string;
  sectionHits: SectionHit[];
  updatedAt: number;
}

interface ContextHeatmapProps {
  sessionId: string | null;
  streaming: boolean;
}

export function ContextHeatmap({ sessionId, streaming }: ContextHeatmapProps) {
  const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAnalytics = (id: string) => {
    fetch(`/api/sessions/${id}/analytics`)
      .then((r) => r.json())
      .then((d: SessionAnalytics) => {
        if (d.sectionHits && d.sectionHits.length > 0) {
          setAnalytics(d);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!sessionId) {
      setAnalytics(null);
      return;
    }

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Fetch immediately
    fetchAnalytics(sessionId);

    if (streaming) {
      // Poll every 3s while streaming
      intervalRef.current = setInterval(() => fetchAnalytics(sessionId), 3000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, streaming]);

  // One final fetch when streaming ends
  useEffect(() => {
    if (!streaming && sessionId) {
      fetchAnalytics(sessionId);
    }
  }, [streaming, sessionId]);

  // Reset when session changes
  useEffect(() => {
    setAnalytics(null);
    setExpanded(false);
  }, [sessionId]);

  if (!analytics || analytics.sectionHits.length === 0) return null;

  const sorted = [...analytics.sectionHits].sort((a, b) => b.hitCount - a.hitCount);
  const maxHits = sorted[0]?.hitCount ?? 1;
  const totalHits = sorted.reduce((sum, s) => sum + s.hitCount, 0);

  return (
    <div style={{ borderTop: "1px solid var(--border-dim)", flexShrink: 0 }}>
      {/* Header row — always visible */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "3px 10px",
          fontSize: 10,
          fontFamily: "var(--font)",
          color: "var(--text-dimmer)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <span style={{ color: "var(--accent)", letterSpacing: "0.05em" }}>CONTEXT REFS</span>
          <span>{sorted.length} sections · {totalHits} hits</span>
          {streaming && (
            <span style={{ color: "var(--accent)", opacity: 0.7 }}>● live</span>
          )}
        </span>
        <span style={{ color: "var(--text-dimmer)", opacity: 0.6 }}>
          top: {sorted[0]?.heading.slice(0, 24)}{(sorted[0]?.heading.length ?? 0) > 24 ? "…" : ""}
        </span>
      </div>

      {/* Expanded section list */}
      {expanded && (
        <div style={{
          borderTop: "1px solid var(--border-dim)",
          padding: "6px 10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 200,
          overflowY: "auto",
        }}>
          {sorted.map((hit) => {
            const pct = maxHits > 0 ? Math.round((hit.hitCount / maxHits) * 100) : 0;
            // Lerp from zinc (dim, ~30% opacity) to emerald at max
            const barOpacity = 0.2 + (pct / 100) * 0.8;
            return (
              <div key={hit.heading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* Label */}
                <div style={{
                  width: 120,
                  minWidth: 120,
                  fontSize: 9,
                  fontFamily: "var(--font)",
                  color: pct >= 60 ? "var(--text)" : "var(--text-dimmer)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>
                  {hit.heading}
                </div>
                {/* Bar */}
                <div style={{ flex: 1, height: 3, background: "var(--border-dim)", position: "relative" }}>
                  <div style={{
                    position: "absolute",
                    top: 0, left: 0,
                    height: "100%",
                    width: `${pct}%`,
                    background: "#10b981",
                    opacity: barOpacity,
                    transition: "width 0.4s ease, opacity 0.4s ease",
                  }} />
                </div>
                {/* Hit count */}
                <div style={{
                  width: 20,
                  textAlign: "right",
                  fontSize: 9,
                  fontFamily: "var(--font)",
                  color: pct >= 60 ? "#10b981" : "var(--text-dimmer)",
                  flexShrink: 0,
                }}>
                  {hit.hitCount}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
