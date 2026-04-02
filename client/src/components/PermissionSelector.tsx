import { useState, useEffect, useRef } from "react";
import { Shield, AlertTriangle } from "lucide-react";
import { fetchApi } from "../lib/api";
import { toast } from "../hooks/useToast";

interface PermissionModeDef {
  id: string;
  label: string;
  description: string;
  allowedTools: string[];
  active: boolean;
}

export default function PermissionSelector() {
  const [modes, setModes] = useState<PermissionModeDef[]>([]);
  const [current, setCurrent] = useState<string>("auto");
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showBypassTip, setShowBypassTip] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchApi("/api/settings/permission-mode")
      .then((r) => r.json())
      .then((d: { current: string; modes: PermissionModeDef[] }) => {
        setCurrent(d.current);
        setModes(d.modes);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showBypassTip) return;
    function onDown(e: MouseEvent) {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) {
        setShowBypassTip(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showBypassTip]);

  async function selectMode(id: string) {
    if (id === current) return;
    const prev = current;
    setCurrent(id);
    try {
      const res = await fetchApi("/api/settings/permission-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: id }),
      });
      if (!res.ok) {
        setCurrent(prev);
        toast("Failed to update permission mode", { variant: "error" });
      }
    } catch {
      setCurrent(prev);
      toast("Failed to update permission mode", { variant: "error" });
    }
  }

  if (loading || modes.length === 0) return null;

  const selected = modes.find((m) => m.id === current);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <Shield size={11} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
        <span className="text-micro">
          Permissions
        </span>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {modes.map((m) => {
          const isActive = m.id === current;
          const isBypass = m.id === "bypass";
          const isHovered = hoveredId === m.id;
          const activeColor = isBypass ? "var(--red)" : "var(--accent)";
          const activeBg = isBypass ? "var(--red-bg)" : "var(--accent-bg)";

          return (
            <div
              key={m.id}
              style={{ position: "relative", display: "inline-flex" }}
              onMouseEnter={() => {
                setHoveredId(m.id);
                if (isBypass) setShowBypassTip(true);
              }}
              onMouseLeave={() => {
                setHoveredId(null);
                if (isBypass) setShowBypassTip(false);
              }}
            >
              <button
                onClick={() => void selectMode(m.id)}
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  fontFamily: "var(--font)",
                  letterSpacing: "0.03em",
                  color: isActive ? activeColor : isHovered ? "var(--text-dim)" : "var(--text-dimmer)",
                  background: isActive ? activeBg : isHovered ? "var(--hover-bg)" : "transparent",
                  border: `1px solid ${isActive ? activeColor : "var(--border-dim)"}`,
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                  transition: "all 0.1s",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  whiteSpace: "nowrap",
                }}
              >
                {isBypass && <AlertTriangle size={10} />}
                {m.label}
              </button>

              {isBypass && showBypassTip && (
                <div
                  ref={tipRef}
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "6px 10px",
                    background: "var(--bg-3)",
                    border: "1px solid var(--red)",
                    borderRadius: "var(--radius)",
                    fontSize: 10,
                    color: "var(--red)",
                    whiteSpace: "nowrap",
                    zIndex: 50,
                    boxShadow: "var(--shadow-sm)",
                    pointerEvents: "none",
                  }}
                >
                  Skips ALL permission checks. Use with extreme caution.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          lineHeight: 1.5,
          paddingLeft: 1,
        }}>
          <span>{selected.description}</span>
          {selected.allowedTools.length > 0 && (
            <span style={{ marginLeft: 6 }}>
              {selected.allowedTools.map((t, i) => (
                <span key={t}>
                  {i > 0 && <span style={{ color: "var(--border)" }}>{" · "}</span>}
                  <span style={{ color: current === "bypass" ? "var(--red)" : "var(--text-dimmer)" }}>{t}</span>
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
