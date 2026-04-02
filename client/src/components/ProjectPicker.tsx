import { useState, useEffect, useRef } from "react";
import type { RecentProject, ProjectPickerProps } from "./project-picker/types";
import { loadLocalRecent, openWorkspace } from "./project-picker/types";
import ActionCard, { FolderIcon, ClockIcon, TerminalIcon } from "./project-picker/ActionCard";
import RecentProjectRow from "./project-picker/RecentProjectRow";

export { default as WorkspaceDropdown } from "./project-picker/WorkspaceDropdown";

export default function ProjectPicker(_props: ProjectPickerProps = {}) {
  const isTauri = typeof window !== "undefined" && typeof window.studio !== "undefined";
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [showPathInput, setShowPathInput] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [newWsInput, setNewWsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newWsError, setNewWsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingDir, setOpeningDir] = useState<string | null>(null);
  const recentRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const newWsInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const local = loadLocalRecent();
    if (isTauri) {
      window.studio?.getRecentProjects()
        .then((r) => {
          const merged = [...r, ...local].reduce<RecentProject[]>((acc, item) => {
            if (!acc.find((a) => a.dir === item.dir)) acc.push(item);
            return acc;
          }, []);
          merged.sort((a, b) => b.lastOpened - a.lastOpened);
          setRecent(merged);
        })
        .catch(() => setRecent(local));
    } else {
      setRecent(local);
    }
  }, [isTauri]);

  useEffect(() => {
    if (showPathInput) setTimeout(() => pathInputRef.current?.focus(), 20);
  }, [showPathInput]);

  useEffect(() => {
    if (showNewWorkspace) setTimeout(() => newWsInputRef.current?.focus(), 20);
  }, [showNewWorkspace]);

  const handleOpenProject = async () => {
    if (isTauri) {
      setLoading(true);
      setError(null);
      try {
        const dir = await window.studio!.pickFolder();
        if (!dir) { setLoading(false); return; }
        await openWorkspace(dir);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open project");
        setLoading(false);
      }
    } else {
      setShowPathInput((v) => !v);
      setShowNewWorkspace(false);
      setError(null);
    }
  };

  const handleSubmitPath = async () => {
    const dir = pathInput.trim();
    if (!dir) return;
    setLoading(true);
    setError(null);
    try {
      await openWorkspace(dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setLoading(false);
    }
  };

  const handleNewWorkspace = async () => {
    const dir = newWsInput.trim();
    if (!dir) return;
    setLoading(true);
    setNewWsError(null);
    try {
      await openWorkspace(dir);
    } catch (e) {
      setNewWsError(e instanceof Error ? e.message : "Failed to create workspace");
      setLoading(false);
    }
  };

  const handleRecentClick = async (proj: RecentProject) => {
    setOpeningDir(proj.dir);
    setError(null);
    try {
      await openWorkspace(proj.dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setOpeningDir(null);
    }
  };

  const handleRecentCardClick = () => {
    if (recent.length === 0) return;
    recentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          const filePath = (file as File & { path?: string }).path;
          if (filePath) {
            setPathInput(filePath);
            setShowPathInput(true);
          }
        }
        break;
      }
    }
  };

  const noInteract: React.CSSProperties = {
    WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        background: "var(--bg)",
        fontFamily: "var(--font-ui)",
        WebkitAppRegion: "drag" as React.CSSProperties["WebkitAppRegion"],
        overflowY: "auto",
        padding: "40px 0",
        boxSizing: "border-box",
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div style={{ textAlign: "center", userSelect: "none" }}>
        <div style={{
          fontSize: 44,
          fontWeight: 600,
          color: "var(--accent)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          marginBottom: 10,
        }}>
          #
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}>
          HASHMARK STUDIO
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.04em" }}>
          v0.1.0
        </div>
      </div>

      <div style={{ ...noInteract, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <ActionCard
          icon={<FolderIcon size={28} color="var(--text-dim)" />}
          label="Open Project"
          sub={loading && !showNewWorkspace ? "Opening..." : "Select a folder"}
          onClick={() => void handleOpenProject()}
          disabled={loading}
        />
        <ActionCard
          icon={<ClockIcon size={28} color="var(--text-dim)" />}
          label="Recent"
          sub={recent.length > 0 ? recent[0].name : "No recent projects"}
          onClick={handleRecentCardClick}
          disabled={recent.length === 0}
        />
        <ActionCard
          icon={<TerminalIcon size={28} color="var(--text-dim)" />}
          label="New Workspace"
          sub="Configure from path"
          onClick={() => {
            setShowNewWorkspace((v) => !v);
            setShowPathInput(false);
            setNewWsError(null);
          }}
          disabled={loading}
        />
      </div>

      {showPathInput && (
        <div style={{ ...noInteract, width: "100%", maxWidth: 480, padding: "0 20px", boxSizing: "border-box" }}>
          <div
            style={{
              background: "var(--bg-2)",
              border: dragOver ? "1px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              transition: "border-color 0.12s",
            }}
          >
            <input
              ref={pathInputRef}
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmitPath();
                if (e.key === "Escape") { setShowPathInput(false); setPathInput(""); setError(null); }
              }}
              placeholder="/path/to/your/project"
              style={{
                width: "100%",
                background: "var(--bg-3)",
                border: "1px solid var(--border-dim)",
                color: "var(--text)",
                fontFamily: "var(--font)",
                fontSize: 12,
                padding: "8px 10px",
                outline: "none",
                borderRadius: "var(--radius)",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            <div style={{
              fontSize: 10,
              color: "var(--text-dimmer)",
              marginBottom: 10,
              textAlign: "center",
            }}>
              or drag a folder here
            </div>
            {error && (
              <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void handleSubmitPath()}
                disabled={loading || !pathInput.trim()}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--radius)",
                  color: "var(--bg)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  cursor: loading || !pathInput.trim() ? "default" : "pointer",
                  opacity: loading || !pathInput.trim() ? 0.5 : 1,
                  transition: "opacity 0.12s",
                }}
              >
                {loading ? "Opening..." : "Open"}
              </button>
              <button
                onClick={() => { setShowPathInput(false); setPathInput(""); setError(null); }}
                style={{
                  padding: "7px 14px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewWorkspace && (
        <div style={{ ...noInteract, width: "100%", maxWidth: 480, padding: "0 20px", boxSizing: "border-box" }}>
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
          }}>
            <div className="label" style={{ marginBottom: 10 }}>
              New Workspace
            </div>
            <input
              ref={newWsInputRef}
              type="text"
              value={newWsInput}
              onChange={(e) => setNewWsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleNewWorkspace();
                if (e.key === "Escape") { setShowNewWorkspace(false); setNewWsInput(""); setNewWsError(null); }
              }}
              placeholder="/path/to/your/project"
              style={{
                width: "100%",
                background: "var(--bg-3)",
                border: "1px solid var(--border-dim)",
                color: "var(--text)",
                fontFamily: "var(--font)",
                fontSize: 12,
                padding: "8px 10px",
                outline: "none",
                borderRadius: "var(--radius)",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            {newWsError && (
              <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8 }}>
                {newWsError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void handleNewWorkspace()}
                disabled={loading || !newWsInput.trim()}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--radius)",
                  color: "var(--bg)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  cursor: loading || !newWsInput.trim() ? "default" : "pointer",
                  opacity: loading || !newWsInput.trim() ? 0.5 : 1,
                  transition: "opacity 0.12s",
                }}
              >
                {loading ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => { setShowNewWorkspace(false); setNewWsInput(""); setNewWsError(null); }}
                style={{
                  padding: "7px 14px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div
          ref={recentRef}
          style={{ ...noInteract, width: "100%", maxWidth: 480, padding: "0 20px", boxSizing: "border-box" }}
        >
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 8,
            paddingLeft: 2,
          }}>
            RECENT
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recent.map((proj) => (
              <RecentProjectRow
                key={proj.dir}
                proj={proj}
                opening={openingDir === proj.dir}
                onOpen={() => void handleRecentClick(proj)}
              />
            ))}
          </div>
        </div>
      )}

      {error && !showPathInput && !showNewWorkspace && (
        <div style={{
          ...noInteract,
          fontSize: 11,
          color: "var(--red)",
          textAlign: "center",
          maxWidth: 400,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
