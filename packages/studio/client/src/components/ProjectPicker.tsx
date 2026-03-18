import { useState } from "react";

export default function ProjectPicker() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isElectron = typeof window.studio !== "undefined";

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

      <div style={{
        marginTop: 40,
        color: "var(--text-dimmer)",
        fontSize: 11,
        opacity: 0.4,
      }}>
        {isElectron ? "or drag a folder here" : ""}
      </div>

      {error && (
        <div style={{ marginTop: 16, color: "var(--red)", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
