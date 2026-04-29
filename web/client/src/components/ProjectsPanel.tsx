import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Session } from "../types";

export interface Project {
  id: string;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  sessionIds: string[];
  agentIds: string[];
  createdAt: number;
}

const STORAGE_KEY = "hm-projects";

const PROJECT_COLORS = [
  "#7b5ea7", "#e05252", "#4a90d9", "#4caf78",
  "#e0913a", "#e05f9d", "#26b8c8", "#c8a826",
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Project[];
  } catch { /* ignore */ }
  return [];
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function getSessionProject(sessionId: string): Project | undefined {
  return loadProjects().find(p => p.sessionIds.includes(sessionId));
}

function loadNotes(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(`hm-project-notes-${projectId}`);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
}

function saveNotes(projectId: string, notes: string[]) {
  localStorage.setItem(`hm-project-notes-${projectId}`, JSON.stringify(notes));
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Session picker ─────────────────────────────────────────────────────────────

function SessionPicker({
  currentIds,
  onAdd,
  onClose,
}: {
  currentIds: string[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchApi<Session[]>("/api/sessions")
      .then(setSessions)
      .catch(() => toast.error("Failed to load sessions"));
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const filtered = sessions.filter(
    s => !currentIds.includes(s.id) && s.title.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        maxHeight: 280, display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search sessions..."
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 12,
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 4, padding: "4px 8px", color: "var(--text)",
            outline: "none", fontFamily: "var(--font-sans)",
          }}
        />
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>No sessions</div>
        )}
        {filtered.map(s => (
          <div
            key={s.id}
            onClick={() => toggle(s.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
              cursor: "pointer", fontSize: 12, color: "var(--text-dim)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{
              width: 12, height: 12, borderRadius: 3,
              border: "1px solid var(--border)",
              background: selected.has(s.id) ? "var(--accent)" : "transparent",
              flexShrink: 0, display: "inline-block",
            }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: 8, borderTop: "1px solid var(--border)", display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{ fontSize: 11, padding: "3px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text)", fontFamily: "var(--font-sans)" }}
        >Cancel</button>
        <button
          onClick={() => { onAdd([...selected]); onClose(); }}
          disabled={selected.size === 0}
          style={{ fontSize: 11, padding: "3px 10px", background: "var(--accent)", border: "none", borderRadius: 4, cursor: selected.size > 0 ? "pointer" : "not-allowed", color: "#fff", fontFamily: "var(--font-sans)", opacity: selected.size === 0 ? 0.5 : 1 }}
        >Add {selected.size > 0 ? `(${selected.size})` : ""}</button>
      </div>
    </div>
  );
}

// ── Agent picker ───────────────────────────────────────────────────────────────

interface AgentItem { id: string; name: string; }

function AgentPicker({
  currentIds,
  onAdd,
  onClose,
}: {
  currentIds: string[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchApi<AgentItem[]>("/api/agents")
      .then(setAgents)
      .catch(() => toast.error("Failed to load agents"));
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const filtered = agents.filter(
    a => !currentIds.includes(a.id) && a.name.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        maxHeight: 260, display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search agents..."
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 12,
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 4, padding: "4px 8px", color: "var(--text)",
            outline: "none", fontFamily: "var(--font-sans)",
          }}
        />
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>No agents</div>
        )}
        {filtered.map(a => (
          <div
            key={a.id}
            onClick={() => toggle(a.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
              cursor: "pointer", fontSize: 12, color: "var(--text-dim)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{
              width: 12, height: 12, borderRadius: 3,
              border: "1px solid var(--border)",
              background: selected.has(a.id) ? "var(--accent)" : "transparent",
              flexShrink: 0, display: "inline-block",
            }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: 8, borderTop: "1px solid var(--border)", display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{ fontSize: 11, padding: "3px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text)", fontFamily: "var(--font-sans)" }}
        >Cancel</button>
        <button
          onClick={() => { onAdd([...selected]); onClose(); }}
          disabled={selected.size === 0}
          style={{ fontSize: 11, padding: "3px 10px", background: "var(--accent)", border: "none", borderRadius: 4, cursor: selected.size > 0 ? "pointer" : "not-allowed", color: "#fff", fontFamily: "var(--font-sans)", opacity: selected.size === 0 ? 0.5 : 1 }}
        >Add {selected.size > 0 ? `(${selected.size})` : ""}</button>
      </div>
    </div>
  );
}

// ── Project detail ─────────────────────────────────────────────────────────────

function ProjectDetail({
  project,
  onUpdate,
  onDelete,
}: {
  project: Project;
  onUpdate: (updated: Project) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.description ?? "");
  const [notes, setNotes] = useState<string[]>(() => loadNotes(project.id));
  const [newNote, setNewNote] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sessionPickerRef = useRef<HTMLDivElement>(null);
  const agentPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(project.name);
    setDesc(project.description ?? "");
    setNotes(loadNotes(project.id));
  }, [project.id, project.name, project.description]);

  useEffect(() => {
    fetchApi<Session[]>("/api/sessions")
      .then(all => setSessions(all.filter(s => project.sessionIds.includes(s.id))))
      .catch(() => {});
  }, [project.sessionIds]);

  useEffect(() => {
    if (project.agentIds.length === 0) return;
    fetchApi<AgentItem[]>("/api/agents")
      .then(all => {
        const map: Record<string, string> = {};
        for (const a of all) map[a.id] = a.name;
        setAgentNames(map);
      })
      .catch(() => {});
  }, [project.agentIds]);

  const save = useCallback(() => {
    const updated = { ...project, name: name.trim() || project.name, description: desc };
    onUpdate(updated);
  }, [project, name, desc, onUpdate]);

  const addNote = () => {
    const text = newNote.trim();
    if (!text) return;
    const updated = [...notes, text];
    setNotes(updated);
    saveNotes(project.id, updated);
    setNewNote("");
  };

  const removeNote = (i: number) => {
    const updated = notes.filter((_, idx) => idx !== i);
    setNotes(updated);
    saveNotes(project.id, updated);
  };

  const addSessions = (ids: string[]) => {
    const updated = { ...project, sessionIds: [...new Set([...project.sessionIds, ...ids])] };
    onUpdate(updated);
  };

  const removeSession = (id: string) => {
    onUpdate({ ...project, sessionIds: project.sessionIds.filter(s => s !== id) });
  };

  const addAgents = (ids: string[]) => {
    onUpdate({ ...project, agentIds: [...new Set([...project.agentIds, ...ids])] });
  };

  const removeAgent = (id: string) => {
    onUpdate({ ...project, agentIds: project.agentIds.filter(a => a !== id) });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", fontSize: 12,
    background: "var(--bg-elevated)", border: "1px solid var(--border)",
    borderRadius: 4, padding: "5px 8px", color: "var(--text)",
    outline: "none", fontFamily: "var(--font-sans)",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
    letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4,
  };

  const miniItem: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
    fontSize: 12, color: "var(--text-dim)", borderBottom: "1px solid var(--border)",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Color bar */}
      <div style={{ height: 3, borderRadius: 2, background: project.color }} />

      {/* Name */}
      <div>
        <div style={sectionLabel}>Name</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === "Enter") save(); }}
          style={inputStyle}
        />
      </div>

      {/* Color */}
      <div>
        <div style={sectionLabel}>Color</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PROJECT_COLORS.map(c => (
            <div
              key={c}
              onClick={() => onUpdate({ ...project, color: c })}
              style={{
                width: 18, height: 18, borderRadius: "50%", background: c,
                cursor: "pointer",
                outline: project.color === c ? `2px solid ${c}` : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <div style={sectionLabel}>Description</div>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onBlur={save}
          rows={2}
          placeholder="Optional description..."
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      {/* Sessions */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={sectionLabel}>Sessions ({project.sessionIds.length})</div>
          <div style={{ position: "relative" }} ref={sessionPickerRef}>
            <button
              onClick={() => setShowSessionPicker(v => !v)}
              style={{ fontSize: 10, padding: "2px 7px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}
            >+ Add</button>
            {showSessionPicker && (
              <SessionPicker
                currentIds={project.sessionIds}
                onAdd={addSessions}
                onClose={() => setShowSessionPicker(false)}
              />
            )}
          </div>
        </div>
        {sessions.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No sessions added</div>
        )}
        {sessions.map(s => (
          <div key={s.id} style={miniItem}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: project.color, flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
            <button
              onClick={() => removeSession(s.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: 0 }}
            >×</button>
          </div>
        ))}
      </div>

      {/* Agents */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={sectionLabel}>Agents ({project.agentIds.length})</div>
          <div style={{ position: "relative" }} ref={agentPickerRef}>
            <button
              onClick={() => setShowAgentPicker(v => !v)}
              style={{ fontSize: 10, padding: "2px 7px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}
            >+ Add</button>
            {showAgentPicker && (
              <AgentPicker
                currentIds={project.agentIds}
                onAdd={addAgents}
                onClose={() => setShowAgentPicker(false)}
              />
            )}
          </div>
        </div>
        {project.agentIds.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No agents added</div>
        )}
        {project.agentIds.map(id => (
          <div key={id} style={miniItem}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: project.color, flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agentNames[id] ?? id}</span>
            <button
              onClick={() => removeAgent(id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: 0 }}
            >×</button>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div>
        <div style={sectionLabel}>Notes ({notes.length})</div>
        {notes.map((note, i) => (
          <div key={i} style={{ ...miniItem, alignItems: "flex-start" }}>
            <span style={{ flex: 1, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{note}</span>
            <button
              onClick={() => removeNote(i)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}
            >×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && e.metaKey) addNote(); }}
            rows={2}
            placeholder="Add a note... (⌘Enter to save)"
            style={{ ...inputStyle, flex: 1, resize: "none", lineHeight: 1.5 }}
          />
          <button
            onClick={addNote}
            style={{ fontSize: 11, padding: "4px 8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text)", fontFamily: "var(--font-sans)", alignSelf: "flex-end" }}
          >+</button>
        </div>
      </div>

      {/* Delete */}
      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        {confirmDelete ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", flex: 1 }}>Delete this project?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ fontSize: 11, padding: "3px 8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text)", fontFamily: "var(--font-sans)" }}
            >Cancel</button>
            <button
              onClick={onDelete}
              style={{ fontSize: 11, padding: "3px 8px", background: "var(--red)", border: "none", borderRadius: 4, cursor: "pointer", color: "#fff", fontFamily: "var(--font-sans)" }}
            >Delete</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ fontSize: 11, color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)" }}
          >Delete project</button>
        )}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [selected, setSelected] = useState<string | null>(null);

  const persist = (updated: Project[]) => {
    setProjects(updated);
    saveProjects(updated);
  };

  const createProject = () => {
    const p: Project = {
      id: uid(),
      name: "New Project",
      color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
      sessionIds: [],
      agentIds: [],
      createdAt: Date.now(),
    };
    const updated = [p, ...projects];
    persist(updated);
    setSelected(p.id);
  };

  const updateProject = (updated: Project) => {
    persist(projects.map(p => p.id === updated.id ? updated : p));
  };

  const deleteProject = (id: string) => {
    persist(projects.filter(p => p.id !== id));
    setSelected(null);
    toast("Project deleted");
  };

  const selectedProject = projects.find(p => p.id === selected) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Project list (top half) */}
      <div style={{ flex: "0 0 auto", maxHeight: "50%", overflowY: "auto", borderBottom: "1px solid var(--border)" }}>
        <div style={{
          display: "flex", alignItems: "center", padding: "8px 12px",
          borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", flex: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>Projects</span>
          <button
            onClick={createProject}
            style={{ fontSize: 11, padding: "2px 8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text)", fontFamily: "var(--font-sans)" }}
          >+ New</button>
        </div>
        {projects.length === 0 && (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--text-muted)" }}>
            No projects yet. Create one to group sessions and agents together.
          </div>
        )}
        {projects.map(p => (
          <div
            key={p.id}
            onClick={() => setSelected(prev => prev === p.id ? null : p.id)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "8px 12px", cursor: "pointer",
              background: selected === p.id ? "var(--bg-active)" : "transparent",
              borderBottom: "1px solid var(--border)",
              borderLeft: selected === p.id ? `3px solid ${p.color}` : "3px solid transparent",
            }}
            onMouseEnter={e => { if (selected !== p.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { if (selected !== p.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                {p.sessionIds.length} session{p.sessionIds.length !== 1 ? "s" : ""} · {p.agentIds.length} agent{p.agentIds.length !== 1 ? "s" : ""}
              </div>
              {p.description && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
              )}
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>Created {fmtDate(p.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Project detail (bottom half) */}
      {selectedProject ? (
        <ProjectDetail
          key={selectedProject.id}
          project={selectedProject}
          onUpdate={updateProject}
          onDelete={() => deleteProject(selectedProject.id)}
        />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Select a project to view details</span>
        </div>
      )}
    </div>
  );
}
