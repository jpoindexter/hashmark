import { useState, useEffect } from "react";
import { basename } from "../lib/path.js";

export default function ProjectPicker() {
  const [loading, setLoading] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const isElectron = typeof window.studio !== "undefined";

  useEffect(() => {
    if (!isElectron) return;
    window.studio?.getRecentProjects?.().then(r => setRecent(r ?? [])).catch(() => {});
  }, [isElectron]);

  const handlePick = async () => {
    setLoading(true);
    setError(null);
    try {
      const dir = await window.studio?.pickFolder();
      if (!dir) {
        setLoading(false);
        return;
      }
      await window.studio?.setProjectDir(dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setLoading(false);
    }
  };

  const handleOpenRecent = async (path: string) => {
    setOpeningPath(path);
    setError(null);
    try {
      await window.studio?.setProjectDir(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setOpeningPath(null);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "var(--bg)",
      fontFamily: "var(--font-ui)",
      WebkitAppRegion: "drag" as React.CSSProperties["WebkitAppRegion"],
    }}>

      {/* Logo + title */}
      <div style={{ marginBottom: 48, textAlign: "center", userSelect: "none" }}>
        <div style={{
          fontSize: 42,
          fontWeight: 900,
          color: "var(--accent)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          marginBottom: 10,
        }}>
          #
        </div>
        <div style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          hashmark studio
        </div>
      </div>

      {/* Action cards */}
      {isElectron && (
        <div style={{
          display: "flex",
          gap: 12,
          WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
        }}>
          <ActionCard
            icon={<FolderIcon />}
            label="Open project"
            sublabel="Select a folder"
            onClick={() => void handlePick()}
            disabled={loading}
            loading={loading}
          />
        </div>
      )}

      {!isElectron && (
        <div style={{
          fontSize: 12,
          color: "var(--text-dimmer)",
          textAlign: "center",
          letterSpacing: "0.03em",
        }}>
          Start studio from the CLI:<br />
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>hashmark studio</span>
        </div>
      )}

      {/* Recent projects */}
      {isElectron && recent.length > 0 && (
        <div style={{
          marginTop: 40,
          width: 400,
          maxWidth: "90vw",
          WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
        }}>
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 10,
            textAlign: "center",
          }}>
            Recent
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recent.map(path => (
              <button
                key={path}
                onClick={() => void handleOpenRecent(path)}
                disabled={openingPath === path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 14px",
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.1s, border-color 0.1s",
                  opacity: openingPath === path ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-dim)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
                }}
              >
                <FolderSmallIcon />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-dim)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {basename(path)}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: "var(--text-dimmer)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 1,
                  }}>
                    {path}
                  </div>
                </div>
                {openingPath === path && (
                  <div style={{ fontSize: 10, color: "var(--text-dimmer)" }}>opening...</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 20,
          fontSize: 11,
          color: "var(--red)",
          textAlign: "center",
          WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

interface ActionCardProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function ActionCard({ icon, label, sublabel, onClick, disabled, loading }: ActionCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: 160,
        height: 110,
        background: hovered ? "var(--bg-3)" : "var(--bg-2)",
        border: `1px solid ${hovered ? "var(--border)" : "var(--border-dim)"}`,
        borderRadius: "var(--radius-lg)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 0.15s, border-color 0.15s",
        padding: 0,
      }}
    >
      <div style={{ color: loading ? "var(--accent)" : "var(--text-dim)", transition: "color 0.15s" }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: 2,
        }}>
          {loading ? "Opening..." : label}
        </div>
        <div style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
        }}>
          {sublabel}
        </div>
      </div>
    </button>
  );
}

function FolderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FolderSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmer)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
