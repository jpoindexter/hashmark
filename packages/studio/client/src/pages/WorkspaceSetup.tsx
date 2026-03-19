import { useState, useEffect, useRef, useCallback } from "react";

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

type Framework = "TypeScript" | "JavaScript" | "Python" | "Go" | "Rust" | "Ruby" | "Java" | "Unknown";

interface DetectionResult {
  framework: Framework;
  name: string;
}

type Step = 1 | 2 | 3;

const STORAGE_KEY = "studio:recent_projects";

function loadRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentProject[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(path: string, name: string) {
  try {
    const existing = loadRecent().filter(r => r.path !== path);
    const updated = [{ path, name, lastOpened: Date.now() }, ...existing].slice(0, 5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function FolderIcon({ size = 16, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={dim ? "var(--text-dimmer)" : "currentColor"}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={done ? "var(--accent)" : "var(--text-dimmer)"}
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      {done
        ? <polyline points="20 6 9 17 4 12" />
        : <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
      }
    </svg>
  );
}

const FRAMEWORK_BADGE_COLORS: Record<Framework, { bg: string; color: string }> = {
  TypeScript: { bg: "rgba(96,165,250,0.12)", color: "var(--blue)" },
  JavaScript: { bg: "rgba(251,191,36,0.12)", color: "var(--yellow)" },
  Python:     { bg: "rgba(96,165,250,0.12)", color: "var(--blue)" },
  Go:         { bg: "rgba(96,165,250,0.12)", color: "var(--blue)" },
  Rust:       { bg: "rgba(251,191,36,0.12)", color: "var(--yellow)" },
  Ruby:       { bg: "rgba(248,113,113,0.12)", color: "var(--red)" },
  Java:       { bg: "rgba(251,191,36,0.12)", color: "var(--yellow)" },
  Unknown:    { bg: "var(--bg-4)", color: "var(--text-dimmer)" },
};

const FORMAT_OPTIONS = [
  { id: "markdown", label: "Markdown", desc: "AGENTS.md / CLAUDE.md" },
  { id: "json",     label: "JSON",     desc: "Machine-readable context" },
  { id: "text",     label: "Plain text", desc: "Compact prose summary" },
];

export default function WorkspaceSetup() {
  const [step, setStep] = useState<Step>(1);
  const [path, setPath] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [formats, setFormats] = useState<string[]>(["markdown"]);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [contextGenerated, setContextGenerated] = useState(false);
  const [mcpReady, setMcpReady] = useState(false);

  const pathInputRef = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  // Poll for MCP readiness on step 3
  useEffect(() => {
    if (step !== 3) return;
    const check = () => {
      fetch("/api/health").then(r => { if (r.ok) setMcpReady(true); }).catch(() => {});
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [step]);

  // Check for generated context file when on step 3
  useEffect(() => {
    if (step !== 3) return;
    fetch("/api/info")
      .then(r => r.json())
      .then((d: { configured?: boolean }) => { if (d.configured) setContextGenerated(true); })
      .catch(() => {});
  }, [step]);

  const detectFramework = useCallback(async (dirPath: string) => {
    setDetecting(true);
    try {
      const res = await fetch("/api/workspace/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
      if (res.ok) {
        const d = await res.json() as { framework?: string; name?: string };
        setDetection({
          framework: (d.framework as Framework) ?? "Unknown",
          name: d.name ?? dirPath.split("/").filter(Boolean).pop() ?? "project",
        });
        setProjectName(d.name ?? dirPath.split("/").filter(Boolean).pop() ?? "project");
      }
    } catch {
      // Fallback: derive name from path
      const name = dirPath.split("/").filter(Boolean).pop() ?? "project";
      setDetection({ framework: "Unknown", name });
      setProjectName(name);
    } finally {
      setDetecting(false);
    }
  }, []);

  const submitPath = async (dirPath: string) => {
    const trimmed = dirPath.trim();
    if (!trimmed) return;
    setPathError(null);

    // Validate via server
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setPathError(d.error ?? "Invalid path");
        return;
      }
    } catch {
      setPathError("Could not reach server");
      return;
    }

    setPath(trimmed);
    await detectFramework(trimmed);
    setStep(2);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current++;
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current--;
    if (dragCount.current <= 0) {
      dragCount.current = 0;
      setDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setDragging(false);

    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          // In Electron, file.path gives the real FS path
          const fsPath = (file as File & { path?: string }).path;
          if (fsPath) {
            await submitPath(fsPath);
            return;
          }
        }
      }
    }

    // Fallback: check dataTransfer.files
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const f = files[0] as File & { path?: string };
      if (f.path) await submitPath(f.path);
    }
  };

  const proceedToStep3 = async () => {
    if (!path) return;
    saveRecent(path, projectName || detection?.name || "project");
    setContextGenerated(false);

    // Activate workspace + trigger scan
    try {
      const listRes = await fetch("/api/workspaces");
      const listData = await listRes.json() as { workspaces: Array<{ id: string; path: string }> };
      const ws = listData.workspaces.find(w => w.path === path);
      if (ws) {
        await fetch(`/api/workspaces/${ws.id}/activate`, { method: "POST" });
      }
    } catch {}

    setStep(3);
  };

  const openStudio = () => {
    window.location.href = "/";
  };

  const card: React.CSSProperties = {
    background: "var(--bg-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: "28px 32px",
    width: 480,
    maxWidth: "92vw",
  };

  const stepDot = (n: Step): React.CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "var(--font-ui)",
    background: step === n ? "var(--accent)" : step > n ? "var(--accent-bg)" : "var(--bg-4)",
    color: step === n ? "var(--bg)" : step > n ? "var(--accent)" : "var(--text-dimmer)",
    border: step > n ? "1px solid var(--accent-border)" : "1px solid var(--border-dim)",
    transition: "all 0.2s",
    flexShrink: 0,
  });

  const stepLabel = (n: Step, label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={stepDot(n)}>{step > n ? "✓" : n}</div>
      <span style={{
        fontSize: 12,
        fontWeight: step === n ? 600 : 400,
        color: step === n ? "var(--text)" : step > n ? "var(--text-dim)" : "var(--text-dimmer)",
        fontFamily: "var(--font-ui)",
        transition: "color 0.2s",
      }}>
        {label}
      </span>
    </div>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "var(--bg)",
      fontFamily: "var(--font-ui)",
      padding: "40px 20px",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: "center", userSelect: "none" }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: "var(--accent)", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8 }}>
          #
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          hashmark studio
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
        {stepLabel(1, "Open project")}
        <div style={{ width: 24, height: 1, background: step > 1 ? "var(--accent-border)" : "var(--border-dim)", transition: "background 0.2s" }} />
        {stepLabel(2, "Configure")}
        <div style={{ width: 24, height: 1, background: step > 2 ? "var(--accent-border)" : "var(--border-dim)", transition: "background 0.2s" }} />
        {stepLabel(3, "Ready")}
      </div>

      {/* ── Step 1: Open project ── */}
      {step === 1 && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
            Open a project
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dimmer)", marginBottom: 24 }}>
            Enter the full path to your project directory, or drag a folder below.
          </div>

          {/* Drop zone + input */}
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e)}
            style={{
              background: dragging ? "var(--accent-bg)" : "var(--bg-3)",
              border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              padding: "20px 18px",
              marginBottom: 16,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ color: dragging ? "var(--accent)" : "var(--text-dimmer)", transition: "color 0.15s" }}>
                <FolderIcon size={20} />
              </div>
              <span style={{ fontSize: 12, color: dragging ? "var(--accent)" : "var(--text-dimmer)", transition: "color 0.15s" }}>
                {dragging ? "Drop to open" : "Drag a folder here, or type a path below"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={pathInputRef}
                type="text"
                value={path}
                onChange={e => { setPath(e.target.value); setPathError(null); }}
                onKeyDown={e => { if (e.key === "Enter") void submitPath(path); }}
                placeholder="/Users/you/projects/myapp"
                style={{
                  flex: 1,
                  background: "var(--bg-2)",
                  border: `1px solid ${pathError ? "var(--red)" : "var(--border)"}`,
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: 12,
                  padding: "8px 12px",
                  outline: "none",
                  borderRadius: "var(--radius)",
                  boxSizing: "border-box",
                  transition: "border-color 0.1s",
                }}
              />
              <button
                className="btn btn-primary"
                style={{ fontSize: 11, padding: "0 18px", flexShrink: 0, letterSpacing: "0.04em" }}
                onClick={() => void submitPath(path)}
                disabled={!path.trim()}
              >
                Open
              </button>
            </div>

            {pathError && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--red)" }}>{pathError}</div>
            )}
          </div>

          {/* Recent projects */}
          {recent.length > 0 && (
            <div>
              <div style={{
                fontSize: 10,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "var(--text-dimmer)",
                marginBottom: 8,
              }}>
                Recent
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {recent.map(proj => (
                  <button
                    key={proj.path}
                    onClick={() => void submitPath(proj.path)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "transparent",
                      border: "1px solid transparent",
                      borderRadius: "var(--radius)",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      transition: "background 0.1s, border-color 0.1s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "var(--bg-3)";
                      e.currentTarget.style.borderColor = "var(--border-dim)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    <FolderIcon size={14} dim />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-dim)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {proj.name}
                      </div>
                      <div style={{
                        fontSize: 10,
                        color: "var(--text-dimmer)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginTop: 1,
                      }}>
                        {proj.path}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0, whiteSpace: "nowrap" }}>
                      {relativeTime(proj.lastOpened)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Configure ── */}
      {step === 2 && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
            Configure project
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dimmer)", marginBottom: 24 }}>
            Adjust settings before generating context.
          </div>

          {/* Project name */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "var(--text-dimmer)",
              marginBottom: 6,
            }}>
              Project name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                padding: "8px 12px",
                outline: "none",
                borderRadius: "var(--radius)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Detected framework */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "var(--text-dimmer)",
              marginBottom: 8,
            }}>
              Detected framework
            </label>
            {detecting ? (
              <div style={{ fontSize: 12, color: "var(--text-dimmer)" }}>Detecting...</div>
            ) : detection ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 10px",
                  borderRadius: 100,
                  fontSize: 11,
                  fontWeight: 600,
                  ...FRAMEWORK_BADGE_COLORS[detection.framework],
                  border: `1px solid ${FRAMEWORK_BADGE_COLORS[detection.framework].color}33`,
                }}>
                  {detection.framework}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{path}</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-dimmer)" }}>—</div>
            )}
          </div>

          {/* Output formats */}
          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "var(--text-dimmer)",
              marginBottom: 8,
            }}>
              Context formats
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FORMAT_OPTIONS.map(opt => {
                const checked = formats.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: checked ? "var(--accent-bg)" : "var(--bg-3)",
                      border: `1px solid ${checked ? "var(--accent-border)" : "var(--border-dim)"}`,
                      borderRadius: "var(--radius)",
                      cursor: "pointer",
                      transition: "background 0.1s, border-color 0.1s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setFormats(prev =>
                          checked ? prev.filter(f => f !== opt.id) : [...prev, opt.id]
                        );
                      }}
                      style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: "var(--text-dimmer)" }}>{opt.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "0 16px" }}
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 12, padding: "0 18px", justifyContent: "center", letterSpacing: "0.04em" }}
              onClick={() => void proceedToStep3()}
              disabled={!projectName.trim()}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Ready ── */}
      {step === 3 && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
            You're all set
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dimmer)", marginBottom: 28 }}>
            {projectName || "Your project"} is ready to use in Studio.
          </div>

          {/* Checklist */}
          <div style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)",
            padding: "14px 16px",
            marginBottom: 28,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            {[
              { label: "Project found", done: true },
              { label: "Context generated", done: contextGenerated },
              { label: "MCP server", done: mcpReady },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CheckIcon done={item.done} />
                <span style={{
                  fontSize: 12,
                  color: item.done ? "var(--text)" : "var(--text-dimmer)",
                  transition: "color 0.2s",
                }}>
                  {item.label}
                </span>
                {!item.done && (
                  <span style={{ fontSize: 10, color: "var(--text-dimmer)", marginLeft: "auto" }}>
                    waiting...
                  </span>
                )}
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary"
            style={{
              width: "100%",
              fontSize: 13,
              padding: "10px 0",
              justifyContent: "center",
              letterSpacing: "0.04em",
              fontWeight: 700,
            }}
            onClick={openStudio}
          >
            Open Studio
          </button>

          <button
            className="btn"
            style={{ width: "100%", marginTop: 8, fontSize: 11, justifyContent: "center" }}
            onClick={() => setStep(1)}
          >
            Open different project
          </button>
        </div>
      )}
    </div>
  );
}
