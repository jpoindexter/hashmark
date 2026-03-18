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
      // setProjectDir triggers window reload — nothing else needed
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
      fontFamily: "var(--font)",
    }}>
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{
          fontSize: 28,
          fontWeight: 900,
          color: "var(--accent)",
          letterSpacing: "-0.03em",
          marginBottom: 8,
        }}>
          # hashmark studio
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dimmer)" }}>
          {isElectron ? "Open a project to get started" : "Start studio from the CLI: hashmark studio"}
        </div>
      </div>

      {isElectron && (
        <button
          className="btn btn-primary"
          onClick={() => void handlePick()}
          disabled={loading}
          style={{ padding: "10px 28px", fontSize: 12 }}
        >
          {loading ? "Opening..." : "> OPEN PROJECT"}
        </button>
      )}

      {isElectron && recent.length > 0 && (
        <div style={{
          marginTop: 40,
          width: 400,
          maxWidth: "90vw",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.08em" }}>RECENT</span>
            <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {recent.map(path => (
              <div
                key={path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--text)",
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
                    marginTop: 2,
                  }}>
                    {path}
                  </div>
                </div>
                <button
                  className="btn"
                  onClick={() => void handleOpenRecent(path)}
                  disabled={openingPath === path}
                  style={{ fontSize: 11, padding: "4px 12px", flexShrink: 0 }}
                >
                  {openingPath === path ? "..." : "Open"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isElectron && (
        <div style={{
          marginTop: 40,
          color: "var(--text-dimmer)",
          fontSize: 11,
          opacity: 0.4,
        }}>
          {""}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16, color: "var(--red)", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
