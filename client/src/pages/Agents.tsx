import { useState, useEffect, useRef, useCallback } from "react";
import ConfirmDialog from "../components/shared/ConfirmDialog.tsx";
import { fetchApi } from "../lib/api";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { toast } from "../hooks/useToast.ts";
import AgentList from "../components/agents/AgentList";
import AgentDetail from "../components/agents/AgentDetail";
import type { Agent, AgentStats, SecurityFinding } from "../components/agents/types";

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [allStats, setAllStats] = useState<Record<string, AgentStats>>({});
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createDept, setCreateDept] = useState("engineering");
  const [createTask, setCreateTask] = useState("");
  const [creating, setCreating] = useState(false);
  const createModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(createModalRef, showCreate, true);

  const [secScanRunning, setSecScanRunning] = useState(false);
  const [secFindings, setSecFindings] = useState<SecurityFinding[] | null>(null);
  const [secDismissed, setSecDismissed] = useState(false);

  useEffect(() => {
    fetchApi("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => { toast.error("Failed to load agents"); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (agents.length === 0) return;
    fetchApi("/api/agents/effectiveness")
      .then((r) => r.json())
      .then((d: { stats: Array<{ agentId: string; totalRuns: number; successRate: number; lastRun: number | null }> }) => {
        const map: Record<string, AgentStats> = {};
        for (const s of d.stats ?? []) map[s.agentId] = { totalRuns: s.totalRuns, successRate: s.successRate, lastRun: s.lastRun };
        setAllStats(map);
      })
      .catch(() => {});
  }, [agents.length]);

  useEffect(() => {
    if (!showCreate) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setShowCreate(false); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showCreate]);

  async function runSecurityScan() {
    setSecScanRunning(true);
    setSecDismissed(false);
    try {
      const r = await fetchApi("/api/agents/security-scan");
      const d = await r.json() as { findings: SecurityFinding[] };
      setSecFindings(d.findings);
    } catch { setSecFindings([]); }
    finally { setSecScanRunning(false); }
  }

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    setCreating(true);
    const frontmatter = `---\nname: ${createName.trim()}\ndescription: ${createDesc.trim()}\n---\n\n${createTask.trim()}`;
    try {
      const res = await fetchApi("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDesc.trim(), department: createDept, content: frontmatter }),
      });
      if (!res.ok) { toast.error("Failed to create agent"); setCreating(false); return; }
      const d = await res.json() as { agent?: Agent };
      if (d.agent) setAgents((prev) => [...prev, d.agent!]);
      toast.success("Agent created");
      setShowCreate(false);
      setCreateName(""); setCreateDesc(""); setCreateDept("engineering"); setCreateTask("");
      fetchApi("/api/agents").then((r) => r.json()).then((dd) => setAgents(dd.agents ?? [])).catch(() => {});
    } catch { toast.error("Failed to create agent"); }
    setCreating(false);
  }, [createName, createDesc, createDept, createTask]);

  function openAgent(agent: Agent) {
    setSelected(agent);
    setEditContent(agent.content);
  }

  async function saveAgent() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetchApi(`/api/agents/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) { toast.error("Failed to save agent"); setSaving(false); return; }
      setAgents((prev) => prev.map((a) => a.id === selected.id ? { ...a, content: editContent } : a));
      toast.success("Agent saved");
      setSelected(null);
    } catch { toast.error("Failed to save agent"); }
    finally { setSaving(false); }
  }

  async function confirmDeleteAgent() {
    if (!pendingDelete) return;
    const agent = pendingDelete;
    setPendingDelete(null);
    try {
      const res = await fetchApi(`/api/agents/${agent.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete agent"); return; }
      setAgents(prev => prev.filter(a => a.id !== agent.id));
      if (selected?.id === agent.id) setSelected(null);
      toast.success("Agent deleted");
    } catch { toast.error("Failed to delete agent"); }
  }

  async function duplicateAgent(agent: Agent) {
    try {
      const res = await fetchApi("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${agent.name} (copy)`, description: agent.description, department: agent.department, content: agent.content }),
      });
      if (!res.ok) { toast.error("Failed to duplicate agent"); return; }
      const d = await res.json() as { agent?: Agent };
      if (d.agent) setAgents(prev => [...prev, d.agent!]);
      toast.success("Agent duplicated");
    } catch { toast.error("Failed to duplicate agent"); }
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <AgentList
        agents={agents}
        loading={loading}
        allStats={allStats}
        onOpenAgent={openAgent}
        onDeleteAgent={(a) => setPendingDelete(a)}
        onDuplicateAgent={(a) => void duplicateAgent(a)}
        onShowCreate={() => setShowCreate(true)}
        secScanRunning={secScanRunning}
        secFindings={secFindings}
        onRunSecurityScan={() => void runSecurityScan()}
        secDismissed={secDismissed}
        onDismissFindings={() => setSecDismissed(true)}
      />

      {showCreate && (
        <CreateAgentModal
          modalRef={createModalRef}
          createName={createName}
          createDesc={createDesc}
          createDept={createDept}
          createTask={createTask}
          creating={creating}
          onNameChange={setCreateName}
          onDescChange={setCreateDesc}
          onDeptChange={setCreateDept}
          onTaskChange={setCreateTask}
          onCreate={() => void handleCreate()}
          onClose={() => setShowCreate(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name}"?`}
        message="This will permanently delete the agent file. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDeleteAgent()}
        onCancel={() => setPendingDelete(null)}
      />

      {selected && (
        <AgentDetail
          agent={selected}
          editContent={editContent}
          onEditContent={setEditContent}
          onSave={() => void saveAgent()}
          saving={saving}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function CreateAgentModal({ modalRef, createName, createDesc, createDept, createTask, creating, onNameChange, onDescChange, onDeptChange, onTaskChange, onCreate, onClose }: {
  modalRef: React.RefObject<HTMLDivElement | null>;
  createName: string; createDesc: string; createDept: string; createTask: string; creating: boolean;
  onNameChange: (v: string) => void; onDescChange: (v: string) => void;
  onDeptChange: (v: string) => void; onTaskChange: (v: string) => void;
  onCreate: () => void; onClose: () => void;
}) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="New Agent"
        onClick={(e) => e.stopPropagation()} className="fade-in"
        style={{
          background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          width: "440px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px",
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "-0.01em" }}>New Agent</span>
          <button onClick={onClose} style={{ color: "var(--text-dimmer)", fontSize: "14px", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <ModalField label="Name *">
            <input value={createName} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Frontend Reviewer" autoFocus />
          </ModalField>
          <ModalField label="Description">
            <input value={createDesc} onChange={(e) => onDescChange(e.target.value)} placeholder="What does this agent do?" />
          </ModalField>
          <ModalField label="Department">
            <select value={createDept} onChange={(e) => onDeptChange(e.target.value)}>
              {["engineering", "product", "design", "marketing", "sales", "operations", "pr", "general"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </ModalField>
          <ModalField label="Task Template">
            <textarea value={createTask} onChange={(e) => onTaskChange(e.target.value)}
              placeholder="Describe what this agent should do when run..." rows={4} style={{ resize: "vertical" }} />
          </ModalField>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onCreate} disabled={creating || !createName.trim()}>
            {creating ? "Creating..." : "Create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
