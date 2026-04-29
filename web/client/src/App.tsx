import { useState, useEffect, useCallback } from "react";
import { Toasts } from "./components/Toasts";
import { Shell } from "./components/Shell";

type ServerState = "checking" | "online" | "offline";

export function App() {
  const [serverState, setServerState] = useState<ServerState>("checking");

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { signal: AbortSignal.timeout(3000) });
      setServerState(res.ok ? "online" : "offline");
    } catch {
      setServerState("offline");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Auto-retry every 3s while offline
  useEffect(() => {
    if (serverState !== "offline") return;
    const id = setInterval(() => void check(), 3000);
    return () => clearInterval(id);
  }, [serverState, check]);

  if (serverState === "checking") {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg)", color: "var(--text-muted)", fontSize: 12,
        fontFamily: "var(--font-mono)",
      }}>
        connecting…
      </div>
    );
  }

  if (serverState === "offline") {
    return (
      <>
        <div style={{
          height: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
          background: "var(--bg)",
        }}>
          <div style={{
            padding: "24px 32px", borderRadius: "var(--radius-lg)",
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            maxWidth: 360, textAlign: "center",
          }}>
            <span style={{ fontSize: 28 }}>⚡</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Studio server offline</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", lineHeight: 1.6 }}>
                Run <code style={{ background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 3, color: "var(--accent-text)" }}>npm run dev</code> in the hashmark directory to start the server.
              </div>
            </div>
            <button
              onClick={() => { setServerState("checking"); void check(); }}
              style={{
                padding: "6px 16px", borderRadius: "var(--radius-md)", fontSize: 12,
                background: "var(--accent)", color: "var(--text-on-accent)", border: "none", cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Auto-retrying every 3s…
          </div>
        </div>
        <Toasts />
      </>
    );
  }

  return (
    <>
      <Shell />
      <Toasts />
    </>
  );
}
