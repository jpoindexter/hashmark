import { useState, useEffect, useRef } from "react";

interface WorkspaceConfig {
  setupCommand?: string;
  runCommand?: string;
}

interface OutputLine {
  type: "stdout" | "stderr" | "start" | "error" | "done";
  text: string;
}

export default function WorkspaceSetup() {
  const [config, setConfig] = useState<WorkspaceConfig>({});
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [setupRunning, setSetupRunning] = useState(false);
  const [runRunning, setRunRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetch("/api/workspace/config")
      .then(r => r.json())
      .then((d: { config: WorkspaceConfig }) => setConfig(d.config ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const saveConfig = (updates: Partial<WorkspaceConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/workspace/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => {});
    }, 500);
  };

  const runStream = async (url: string, setRunning: (v: boolean) => void) => {
    setOutput([]);
    setRunning(true);
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok || !res.body) {
        setOutput([{ type: "error", text: "Failed to start" }]);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw) as OutputLine & { command?: string; code?: number };
            if (evt.type === "start") {
              setOutput(prev => [...prev, { type: "start", text: `$ ${evt.command ?? ""}` }]);
            } else if (evt.type === "stdout" || evt.type === "stderr") {
              setOutput(prev => [...prev, { type: evt.type as "stdout" | "stderr", text: evt.text ?? "" }]);
            } else if (evt.type === "done") {
              setOutput(prev => [...prev, { type: "done", text: evt.code === 0 ? "✓ done" : `✗ exited ${evt.code}` }]);
            } else if (evt.type === "error") {
              setOutput(prev => [...prev, { type: "error", text: (evt as { message?: string }).message ?? "error" }]);
            }
          } catch {}
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const stopProcess = async (name: string) => {
    await fetch("/api/workspace/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processName: name }),
    });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-3)",
    border: "1px solid var(--border-dim)",
    color: "var(--text)",
    fontFamily: "var(--font)",
    fontSize: 12,
    padding: "8px 10px",
    outline: "none",
    boxSizing: "border-box",
    borderRadius: "var(--radius)",
  };

  return (
    <div style={{ padding: "24px 28px", fontFamily: "var(--font)", maxWidth: 720 }}>
      <h2 style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 24, fontWeight: 400 }}>
        WORKSPACE SETUP
      </h2>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 11, color: "var(--text-dimmer)", marginBottom: 6, letterSpacing: "0.05em" }}>
          SETUP COMMAND
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={config.setupCommand ?? ""}
            onChange={e => saveConfig({ setupCommand: e.target.value })}
            placeholder="npm install"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            className="btn btn-primary"
            disabled={setupRunning || !config.setupCommand?.trim()}
            onClick={() => void runStream("/api/workspace/run-setup", setSetupRunning)}
            style={{ fontSize: 11, padding: "0 16px", flexShrink: 0 }}
          >
            {setupRunning ? "RUNNING..." : "> RUN"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 11, color: "var(--text-dimmer)", marginBottom: 6, letterSpacing: "0.05em" }}>
          RUN COMMAND
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={config.runCommand ?? ""}
            onChange={e => saveConfig({ runCommand: e.target.value })}
            placeholder="npm run dev"
            style={{ ...inputStyle, flex: 1 }}
          />
          {runRunning ? (
            <button
              style={{
                background: "none",
                border: "1px solid var(--red)",
                color: "var(--red)",
                fontFamily: "var(--font)",
                fontSize: 11,
                padding: "0 16px",
                cursor: "pointer",
                flexShrink: 0,
                borderRadius: "var(--radius)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
              onClick={() => void stopProcess("run")}
            >
              ■ STOP
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={!config.runCommand?.trim()}
              onClick={() => void runStream("/api/workspace/run", setRunRunning)}
              style={{ fontSize: 11, padding: "0 16px", flexShrink: 0 }}
            >
              &gt; START
            </button>
          )}
        </div>
      </div>

      {output.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border-dim)", paddingTop: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.08em", marginBottom: 8 }}>
            OUTPUT
          </div>
          <div
            ref={outputRef}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border-dim)",
              padding: "12px 14px",
              fontFamily: "var(--font)",
              fontSize: 12,
              maxHeight: 300,
              overflowY: "auto",
              lineHeight: 1.6,
              borderRadius: "var(--radius)",
            }}
          >
            {output.map((line, i) => (
              <div
                key={i}
                style={{
                  color:
                    line.type === "stderr" ? "var(--yellow)"
                    : line.type === "error" ? "var(--red)"
                    : line.type === "done" ? "var(--accent)"
                    : line.type === "start" ? "var(--text-dim)"
                    : "var(--text)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {line.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
