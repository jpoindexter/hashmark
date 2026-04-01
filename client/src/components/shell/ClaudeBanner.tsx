import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchApi } from "../../lib/api";

const DISMISS_KEY = "studio:claude_banner_dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "true";
  } catch { return false; }
}

function dismiss() {
  try { localStorage.setItem(DISMISS_KEY, "true"); } catch {}
}

export default function ClaudeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDismissed()) return;
    fetchApi("/api/health")
      .then((r) => r.json())
      .then((d: { checks?: { claude?: boolean } }) => {
        if (d.checks?.claude === false) setVisible(true);
      })
      .catch(() => {});
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 14px",
      background: "var(--yellow-bg)",
      borderBottom: "1px solid var(--yellow)",
      flexShrink: 0,
      fontSize: 11,
      fontFamily: "var(--font-ui)",
    }}>
      <AlertTriangle size={13} style={{ color: "var(--yellow)", flexShrink: 0 }} />
      <span style={{ color: "var(--text-dim)", flex: 1 }}>
        <span style={{ color: "var(--yellow)", fontWeight: 600 }}>Claude CLI not found.</span>
        {" "}Install it to run agents:{" "}
        <a
          href="https://claude.ai/download"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--yellow)", textDecoration: "underline" }}
        >
          https://claude.ai/download
        </a>
      </span>
      <button
        onClick={() => { dismiss(); setVisible(false); }}
        title="Dismiss"
        aria-label="Dismiss"
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
