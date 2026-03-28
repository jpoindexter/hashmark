import { useState, useEffect, useRef, useMemo, useReducer, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AgentCard from "../components/AgentCard.tsx";
import ConfirmDialog from "../components/shared/ConfirmDialog.tsx";
import { fetchApi } from "../lib/api";

type RunStatus = "idle" | "starting" | "running" | "done" | "error" | "stopped" | "interrupted";

type RunAction =
  | { type: "START" } | { type: "FIRST_CHUNK" } | { type: "DONE" }
  | { type: "ERROR" } | { type: "STOP" } | { type: "INTERRUPT" } | { type: "RESET" }

const VALID_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  idle:        ["starting"],
  starting:    ["running", "error", "stopped"],
  running:     ["done", "error", "stopped", "interrupted"],
  done:        ["idle"],
  error:       ["idle"],
  stopped:     ["idle"],
  interrupted: ["idle"],
};

function runStatusReducer(state: RunStatus, action: RunAction): RunStatus {
  const next: RunStatus =
    action.type === "START"        ? "starting" :
    action.type === "FIRST_CHUNK"  ? "running" :
    action.type === "DONE"         ? "done" :
    action.type === "ERROR"        ? "error" :
    action.type === "STOP"         ? "stopped" :
    action.type === "INTERRUPT"    ? "interrupted" :
    action.type === "RESET"        ? "idle" : state;

  return VALID_TRANSITIONS[state].includes(next) ? next : state;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
  content: string;
}

const ALL_DEPTS = "all";
type SortKey = "name" | "lastRun" | "runCount";

interface AgentStats {
  totalRuns: number;
  successRate: number;
  lastRun: number | null;
}

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", note: "1M ctx" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "fast" },
];

export default function Agents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [allStats, setAllStats] = useState<Record<string, AgentStats>>({});
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createDept, setCreateDept] = useState("engineering");
  const [createTask, setCreateTask] = useState("");
  const [creating, setCreating] = useState(false);

  const [tab, setTab] = useState<"edit" | "run" | "gov">("edit");
  const [runPrompt, setRunPrompt] = useState("");
  const [runModel, setRunModel] = useState("claude-sonnet-4-6");
  const [output, setOutput] = useState("");
  const [runStatus, dispatchRunStatus] = useReducer(runStatusReducer, "idle" as RunStatus);
  const running = runStatus === "starting" || runStatus === "running";
  const [runMeta, setRunMeta] = useState<{ startedAt: number; durationMs?: number; wordCount?: number } | null>(null);
  const [loopDetected, setLoopDetected] = useState<{ count: number; pattern: string } | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const loopCountRef = useRef(0);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ tools: string[] } | null>(null);
  const pendingApprovalResolveRef = useRef<((approved: boolean) => void) | null>(null);

  type SecurityFinding = {
    agentId: string; agentName: string;
    severity: "critical" | "high" | "medium";
    category: "secret" | "tracking" | "prompt-injection" | "exfiltration";
    message: string; line: number; snippet: string;
  };
  const [secScanRunning, setSecScanRunning] = useState(false);
  const [secFindings, setSecFindings] = useState<SecurityFinding[] | null>(null);
  const [secDismissed, setSecDismissed] = useState(false);

  async function runSecurityScan() {
    setSecScanRunning(true);
    setSecDismissed(false);
    try {
      const r = await fetchApi("/api/agents/security-scan");
      const d = await r.json() as { findings: SecurityFinding[] };
      setSecFindings(d.findings);
    } catch {
      setSecFindings([]);
    } finally {
      setSecScanRunning(false);
    }
  }

  useEffect(() => {
    fetchApi("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to load agents", type: "error" } }));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (agents.length === 0) return;
    fetchApi("/api/agents/effectiveness")
      .then((r) => r.json())
      .then((d: { stats: Array<{ agentId: string; totalRuns: number; successRate: number; lastRun: number | null }> }) => {
        const map: Record<string, AgentStats> = {};
        for (const s of d.stats ?? []) {
          map[s.agentId] = { totalRuns: s.totalRuns, successRate: s.successRate, lastRun: s.lastRun };
        }
        setAllStats(map);
      })
      .catch(() => {});
  }, [agents.length]);

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    setCreating(true);
    const frontmatter = `---\nname: ${createName.trim()}\ndescription: ${createDesc.trim()}\n---\n\n${createTask.trim()}`;
    try {
      const res = await fetchApi("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim(),
          department: createDept,
          content: frontmatter,
        }),
      });
      if (res.ok) {
        const d = await res.json() as { agent?: Agent };
        if (d.agent) setAgents((prev) => [...prev, d.agent!]);
      }
    } catch {}
    setShowCreate(false);
    setCreateName(""); setCreateDesc(""); setCreateDept("engineering"); setCreateTask("");
    fetchApi("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => {});
    setCreating(false);
  }, [createName, createDesc, createDept, createTask]);

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const departments = useMemo(
    () => Array.from(new Set(agents.map((a) => a.department))).sort(),
    [agents],
  );

  useEffect(() => {
    if (!deptDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
        setDeptDropdownOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDeptDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [deptDropdownOpen]);

  const deptCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of agents) {
      map[a.department] = (map[a.department] ?? 0) + 1;
    }
    return map;
  }, [agents]);

  function toggleDept(dept: string) {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const base = agents.filter((a) => {
      const matchDept = selectedDepts.size === 0 || selectedDepts.has(a.department);
      const matchSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase());
      return matchDept && matchSearch;
    });

    return [...base].sort((a, b) => {
      if (sortKey === "name") return (a.name || a.id).localeCompare(b.name || b.id);
      if (sortKey === "lastRun") {
        const aLast = allStats[a.id]?.lastRun ?? 0;
        const bLast = allStats[b.id]?.lastRun ?? 0;
        return bLast - aLast;
      }
      if (sortKey === "runCount") {
        const aC = allStats[a.id]?.totalRuns ?? 0;
        const bC = allStats[b.id]?.totalRuns ?? 0;
        return bC - aC;
      }
      return 0;
    });
  }, [agents, selectedDepts, search, sortKey, allStats]);

  const grouped: Record<string, Agent[]> = {};
  for (const agent of filtered) {
    if (!grouped[agent.department]) grouped[agent.department] = [];
    grouped[agent.department].push(agent);
  }

  function deleteAgent(agent: Agent) {
    setPendingDelete(agent);
  }

  async function confirmDeleteAgent() {
    if (!pendingDelete) return;
    const agent = pendingDelete;
    setPendingDelete(null);
    await fetchApi(`/api/agents/${agent.id}`, { method: "DELETE" }).catch(() => {});
    setAgents(prev => prev.filter(a => a.id !== agent.id));
    if (selected?.id === agent.id) setSelected(null);
  }

  async function duplicateAgent(agent: Agent) {
    const res = await fetchApi("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${agent.name} (copy)`,
        description: agent.description,
        department: agent.department,
        content: agent.content,
      }),
    }).catch(() => null);
    if (!res?.ok) return;
    const d = await res.json() as { agent?: Agent };
    if (d.agent) setAgents(prev => [...prev, d.agent!]);
  }

  function openAgent(agent: Agent) {
    setSelected(agent);
    setEditContent(agent.content);
    setTab("edit");
    setOutput("");
    setRunPrompt("");
    setLoopDetected(null);
    loopCountRef.current = 0;
    dispatchRunStatus({ type: "RESET" });
  }

  async function saveAgent() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetchApi(`/api/agents/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      setAgents((prev) => prev.map((a) => a.id === selected.id ? { ...a, content: editContent } : a));
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  async function runAgent() {
    if (!selected || !runPrompt.trim() || running) return;

    if (approvalRequired) {
      const tools = govInfo?.tools ?? [];
      if (tools.length > 0) {
        const approved = await new Promise<boolean>((resolve) => {
          pendingApprovalResolveRef.current = resolve;
          setPendingApproval({ tools });
        });
        setPendingApproval(null);
        pendingApprovalResolveRef.current = null;
        if (!approved) return;
      }
    }

    dispatchRunStatus({ type: "START" });
    setOutput("");
    setLoopDetected(null);
    loopCountRef.current = 0;
    const startedAt = Date.now();
    setRunMeta({ startedAt });

    try {
      const sessRes = await fetchApi("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const sessData = await sessRes.json() as { session: { id: string } };
      const sid = sessData.session.id;

      const chatRes = await fetchApi(`/api/sessions/${sid}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: runPrompt.trim(),
          model: runModel,
          systemPrompt: selected.content,
        }),
      });

      if (!chatRes.ok || !chatRes.body) {
        setOutput("Error: failed to start agent run.");
        dispatchRunStatus({ type: "ERROR" });
        setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt } : null);
        return;
      }

      const reader = chatRes.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let assembled = "";
      let userStopped = false;
      let loopInterrupted = false;

      abortRef.current = () => {
        userStopped = true;
        reader.cancel().catch(() => {});
      };

      try {
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
              const evt = JSON.parse(raw) as { type: string; text?: string; success?: boolean };
              if (evt.type === "text" && evt.text) {
                if (runStatus === "starting") dispatchRunStatus({ type: "FIRST_CHUNK" });
                assembled += evt.text;
                setOutput(assembled);
                if (assembled.length > 600) {
                  const tail = assembled.slice(-250);
                  const earlier = assembled.slice(0, assembled.length - 250);
                  if (earlier.includes(tail)) {
                    loopCountRef.current += 1;
                    if (loopCountRef.current === 1) {
                      setLoopDetected({ count: 1, pattern: tail.slice(0, 60).trim() });
                    } else if (loopCountRef.current >= 3) {
                      loopInterrupted = true;
                      reader.cancel().catch(() => {});
                      setLoopDetected({ count: loopCountRef.current, pattern: tail.slice(0, 60).trim() });
                    }
                  }
                }
              } else if (evt.type === "done") {
                const action: RunAction = loopInterrupted ? { type: "INTERRUPT" }
                  : userStopped ? { type: "STOP" }
                  : evt.success ? { type: "DONE" } : { type: "ERROR" };
                dispatchRunStatus(action);
                setRunMeta({ startedAt, durationMs: Date.now() - startedAt, wordCount: assembled.trim().split(/\s+/).length });
              }
            } catch {}
          }
        }
      } finally {
        abortRef.current = null;
        if (loopInterrupted) dispatchRunStatus({ type: "INTERRUPT" });
        else if (userStopped) dispatchRunStatus({ type: "STOP" });
        else dispatchRunStatus({ type: "DONE" });
        setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt, wordCount: assembled.trim().split(/\s+/).length } : null);
      }
    } catch {
      setOutput("Error: agent run failed.");
      dispatchRunStatus({ type: "ERROR" });
      setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt } : null);
    }
  }

  function stopRun() {
    abortRef.current?.();
  }

  const currentModel = MODELS.find((m) => m.id === runModel) ?? MODELS[1];

  type Segment =
    | { type: "h1" | "h2" | "h3"; text: string }
    | { type: "code"; lang: string; content: string }
    | { type: "list"; items: string[] }
    | { type: "para"; text: string }
    | { type: "tool_event"; tool: string; detail: string };

  const TOOL_PATTERNS: Array<{ re: RegExp; tool: string }> = [
    { re: /^(?:Bash|Running bash|Executing)\s*[:：]\s*(.+)/i, tool: "Bash" },
    { re: /^(?:Read(?:ing)?(?: file)?)\s*[:：]\s*(.+)/i, tool: "Read" },
    { re: /^(?:Writ(?:e|ing)(?: to)?)\s*[:：]\s*(.+)/i, tool: "Write" },
    { re: /^(?:Edit(?:ing)?)\s*[:：]\s*(.+)/i, tool: "Edit" },
    { re: /^(?:Glob(?:bing)?|Find(?:ing)? files?)\s*[:：]\s*(.+)/i, tool: "Glob" },
    { re: /^(?:Grep(?:ping)?|Search(?:ing)? (?:for )?files?)\s*[:：]\s*(.+)/i, tool: "Grep" },
  ];

  const segments = useMemo((): Segment[] => {
    if (!output) return [];
    const result: Segment[] = [];
    const lines = output.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith("```")) {
        const lang = line.slice(3).trim() || "text";
        const contentLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          contentLines.push(lines[i]);
          i++;
        }
        result.push({ type: "code", lang, content: contentLines.join("\n") });
        i++;
        continue;
      }

      const h3 = line.match(/^###\s+(.*)/);
      if (h3) { result.push({ type: "h3", text: h3[1] }); i++; continue; }
      const h2 = line.match(/^##\s+(.*)/);
      if (h2) { result.push({ type: "h2", text: h2[1] }); i++; continue; }
      const h1 = line.match(/^#\s+(.*)/);
      if (h1) { result.push({ type: "h1", text: h1[1] }); i++; continue; }

      if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
        const items: string[] = [];
        while (i < lines.length && (lines[i].match(/^[-*]\s+/) || lines[i].match(/^\d+\.\s+/))) {
          items.push(lines[i].replace(/^[-*\d.]+\s+/, ""));
          i++;
        }
        result.push({ type: "list", items });
        continue;
      }

      if (!line.trim()) { i++; continue; }

      const toolMatch = TOOL_PATTERNS.reduce<{ tool: string; detail: string } | null>((found, p) => {
        if (found) return found;
        const m = line.match(p.re);
        return m ? { tool: p.tool, detail: m[1].trim().slice(0, 120) } : null;
      }, null);
      if (toolMatch) {
        result.push({ type: "tool_event", tool: toolMatch.tool, detail: toolMatch.detail });
        i++;
        continue;
      }

      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].startsWith("#") &&
        !lines[i].startsWith("```") &&
        !lines[i].match(/^[-*]\s+/) &&
        !lines[i].match(/^\d+\.\s+/)
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length) result.push({ type: "para", text: paraLines.join(" ") });
    }

    return result;
  }, [output]);

  function renderInline(text: string) {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={idx} style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border-dim)",
            borderRadius: 2,
            padding: "0 4px",
            fontSize: 11,
            fontFamily: "var(--font)",
            color: "var(--accent)",
          }}>{part.slice(1, -1)}</code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} style={{ color: "var(--text)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={idx}>{part}</span>;
    });
  }

  type RecentTrend = "improving" | "stable" | "degrading" | "insufficient_data";
  interface EffectivenessData {
    agentId: string;
    totalRuns: number;
    successRate: number;
    recentTrend: RecentTrend;
    recentSuccessRate: number;
    avgOutputLength: number;
    lastRun: number | null;
  }
  const [effectiveness, setEffectiveness] = useState<EffectivenessData | null>(null);

  useEffect(() => {
    if (!selected) return;
    setEffectiveness(null);
    fetchApi(`/api/agents/${selected.id}/effectiveness`)
      .then(r => r.json())
      .then(d => setEffectiveness(d as EffectivenessData))
      .catch(() => {});
  }, [selected?.id]);

  type CheckStatus = "pass" | "warn" | "error";
  type SkillCheck = { id: string; label: string; status: CheckStatus; detail: string };

  const [showAllChecks, setShowAllChecks] = useState(false);

  const skillChecks = useMemo((): SkillCheck[] => {
    const text = editContent;
    const len = text.length;
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch ? fmMatch[1] : "";

    const hasName = /^name\s*:/m.test(fm);
    const hasDesc = /^description\s*:/m.test(fm);
    const descLine = fm.match(/^description\s*:\s*(.+)/m)?.[1]?.trim() ?? "";

    const body = fmMatch ? text.slice(fmMatch[0].length).trim() : text.trim();
    const checks: SkillCheck[] = [];

    checks.push({
      id: "has-name", label: "HAS NAME",
      status: hasName ? "pass" : "error",
      detail: hasName ? "name: present" : "Missing name: in frontmatter",
    });

    checks.push({
      id: "has-desc", label: "HAS DESCRIPTION",
      status: hasDesc ? "pass" : "error",
      detail: hasDesc ? "description: present" : "Missing description: in frontmatter",
    });

    const descVague = /^agent for\s/i.test(descLine);
    const descShort = descLine.length > 0 && descLine.length < 20;
    const descStatus: CheckStatus = !hasDesc ? "error" : (descShort || descVague) ? "warn" : "pass";
    checks.push({
      id: "desc-specific", label: "DESCRIPTION QUALITY",
      status: descStatus,
      detail: !hasDesc ? "No description" : descVague ? "Too generic — avoid 'Agent for X'" : descShort ? `Only ${descLine.length} chars — be more specific` : "Looks specific",
    });

    const bodyLen = body.length;
    checks.push({
      id: "has-instructions", label: "HAS INSTRUCTIONS",
      status: bodyLen >= 100 ? "pass" : "warn",
      detail: bodyLen >= 100 ? `${bodyLen} chars of instructions` : `Body too short (${bodyLen} chars) — add concrete instructions or examples`,
    });

    const secretMatch = text.match(/sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{10,}|api[_-]?key\s*[:=]\s*['"]?\S{8,}/i);
    checks.push({
      id: "no-secrets", label: "NO SECRETS",
      status: secretMatch ? "error" : "pass",
      detail: secretMatch ? `Potential secret detected: ${secretMatch[0].slice(0, 12)}…` : "No credential patterns found",
    });

    const broadMatch = text.match(/\bdo anything\b|\ball tools\b|\bno restrictions\b/i);
    checks.push({
      id: "no-broad-perms", label: "SCOPED PERMISSIONS",
      status: broadMatch ? "warn" : "pass",
      detail: broadMatch ? `Broad permission phrase: "${broadMatch[0]}"` : "No overly broad permission phrases",
    });

    const lenStatus: CheckStatus = len < 200 ? "warn" : len > 8000 ? "warn" : "pass";
    checks.push({
      id: "reasonable-length", label: "REASONABLE LENGTH",
      status: lenStatus,
      detail: len < 200 ? `${len} chars — too vague, add more detail` : len > 8000 ? `${len} chars — very long, may hurt injection efficiency` : `${len} chars — good`,
    });

    const anythingCount = (text.match(/\banything\b/gi) ?? []).length;
    checks.push({
      id: "clear-scope", label: "CLEAR SCOPE",
      status: anythingCount > 2 ? "warn" : "pass",
      detail: anythingCount > 2 ? `"anything" used ${anythingCount}x — scope is too vague` : "Scope looks defined",
    });

    return checks;
  }, [editContent]);

  const passingCount = skillChecks.filter((c) => c.status === "pass").length;
  const hasErrors = skillChecks.some((c) => c.status === "error");
  const hasWarnings = skillChecks.some((c) => c.status === "warn");
  const overallStatus: "GOOD" | "NEEDS WORK" | "INVALID" =
    hasErrors ? "INVALID" : hasWarnings ? "NEEDS WORK" : "GOOD";
  const overallColor =
    hasErrors ? "var(--red)" : hasWarnings ? "var(--yellow)" : "var(--accent)";

  const failureClass = useMemo(() => {
    if (runStatus === "running" || runStatus === "idle") return null;

    if (runStatus === "done") {
      const words = output.trim().split(/\s+/).filter(Boolean).length;
      if (words > 0 && words < 15) {
        return { label: "MINIMAL OUTPUT", color: "var(--yellow)", detail: `Only ${words} words` };
      }
      return null;
    }

    if (!output.trim()) {
      return { label: "NO OUTPUT", color: "var(--red)", detail: "Agent produced nothing" };
    }

    const words = output.trim().split(/\s+/).filter(Boolean).length;
    const hedges = (output.match(/\b(I would|I could|I should|I might|we would|we could)\b/gi) ?? []).length;
    if (hedges > 3 && words > 0 && hedges / words > 0.03) {
      return { label: "PLANNING MODE", color: "var(--yellow)", detail: "Agent planned instead of executing" };
    }

    if (runStatus === "error") {
      if (/\b(cannot|can't|unable to|don't have access|not able to)\b/i.test(output)) {
        return { label: "AGENT BLOCKED", color: "var(--red)", detail: "Capability limitation reported" };
      }
      return { label: "RUN ERROR", color: "var(--red)", detail: "Run ended with error" };
    }

    if (runStatus === "stopped") {
      if (words < 30) return { label: "PREMATURE STOP", color: "var(--yellow)", detail: "Stopped before meaningful output" };
      return { label: "STOPPED", color: "var(--yellow)", detail: `Stopped at ${words} words` };
    }

    if (runStatus === "interrupted") {
      return { label: "LOOP DETECTED", color: "var(--yellow)", detail: loopDetected ? `Pattern repeated ×${loopDetected.count}` : "Auto-stopped on loop" };
    }

    if (runStatus === "starting") return null;

    return null;
  }, [runStatus, output, loopDetected]);

  const govInfo = useMemo(() => {
    const content = selected?.content ?? "";
    if (!content) return null;

    const headingMatch = content.match(/^#\s+(.+)/m);
    const roleMatch = content.match(/you are\s+([^.\n]{10,80})/i);
    const role = headingMatch?.[1] ?? roleMatch?.[1] ?? null;

    const lc = content.toLowerCase();
    const riskClass =
      /stripe|payment|billing|checkout|subscription/.test(lc) ? "HIGH" :
      /auth|jwt|session|clerk|oauth|login|password/.test(lc) && /database|prisma|sql|supabase/.test(lc) ? "MEDIUM" :
      "LOW";

    const toolNames = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "MCP"];
    const tools = toolNames.filter((t) => new RegExp(`\\b${t}\\b`).test(content));

    const constraints = content
      .split("\n")
      .filter((l) => /\b(never|do not|must not|always|prohibited|forbidden)\b/i.test(l))
      .map((l) => l.replace(/^[-*#>\s]+/, "").trim())
      .filter((l) => l.length > 10 && l.length < 120)
      .slice(0, 6);

    const nonDelegation = content
      .split("\n")
      .filter((l) => /\b(do not delegate|never delegate|human approval|require confirmation|escalate)\b/i.test(l))
      .map((l) => l.replace(/^[-*#>\s]+/, "").trim())
      .filter((l) => l.length > 5)
      .slice(0, 4);

    return { role, riskClass, tools, constraints, nonDelegation };
  }, [selected?.content]);

  const STATUS_BADGE: Record<string, { label: string; color: string }> = {
    idle:        { label: "IDLE",        color: "var(--text-dimmer)" },
    starting:    { label: "STARTING",    color: "var(--accent)" },
    running:     { label: "RUNNING",     color: "var(--accent)" },
    done:        { label: "DONE",        color: "var(--accent)" },
    error:       { label: "ERROR",       color: "var(--red)" },
    stopped:     { label: "STOPPED",     color: "var(--yellow)" },
    interrupted: { label: "INTERRUPTED", color: "var(--yellow)" },
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "28px",
        borderRight: selected ? "1px solid var(--border-dim)" : "none",
      }}>
        <div style={{ marginBottom: "20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "4px" }}>
              Agent Company
            </h1>
            <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
              {agents.length} agents across {departments.length} departments
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
            <button
              className="btn btn-sm"
              onClick={() => void runSecurityScan()}
              disabled={secScanRunning}
            >
              {secScanRunning ? "scanning..." : "security scan"}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreate(true)}
            >
              + new agent
            </button>
          </div>
        </div>

        {secFindings !== null && !secDismissed && (
          <div style={{
            background: secFindings.length === 0 ? "rgba(63,185,80,0.06)" : "rgba(248,81,73,0.06)",
            border: `1px solid ${secFindings.length === 0 ? "rgba(63,185,80,0.25)" : "rgba(248,81,73,0.25)"}`,
            borderRadius: "var(--radius)",
            marginBottom: "20px",
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: secFindings.length > 0 ? "1px solid var(--border-dim)" : "none",
            }}>
              <span style={{ fontSize: 11, fontFamily: "var(--font)", fontWeight: 600, color: secFindings.length === 0 ? "var(--accent)" : "var(--red)" }}>
                {secFindings.length === 0 ? "✓ No security issues found" : `✕ ${secFindings.length} issue${secFindings.length !== 1 ? "s" : ""} found`}
              </span>
              <button
                onClick={() => setSecDismissed(true)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: 14, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>
            {secFindings.length > 0 && (
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {secFindings.map((f, i) => (
                  <div
                    key={i}
                    onClick={() => { const a = agents.find((ag) => ag.id === f.agentId); if (a) openAgent(a); }}
                    style={{
                      padding: "8px 12px",
                      borderBottom: i < secFindings.length - 1 ? "1px solid var(--border-dim)" : "none",
                      cursor: "pointer",
                      display: "flex", gap: 10, alignItems: "flex-start",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-3)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                  >
                    <span style={{
                      fontSize: 9, fontFamily: "var(--font)", fontWeight: 700, letterSpacing: "0.06em",
                      padding: "2px 5px", borderRadius: 2, flexShrink: 0, marginTop: 1,
                      background: f.severity === "critical" ? "rgba(248,81,73,0.15)" : f.severity === "high" ? "rgba(210,153,34,0.15)" : "rgba(56,139,253,0.1)",
                      color: f.severity === "critical" ? "var(--red)" : f.severity === "high" ? "var(--yellow)" : "var(--blue)",
                    }}>
                      {f.severity.toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--text)", marginBottom: 2 }}>{f.message}</div>
                      <div style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                        {f.agentName} · line {f.line} · <span style={{ opacity: 0.7 }}>{f.snippet}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1", minWidth: "160px", maxWidth: "240px" }}
          />
          <div ref={deptDropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDeptDropdownOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                border: "1px solid",
                borderColor: selectedDepts.size > 0 ? "var(--accent)" : "var(--border-dim)",
                borderRadius: "var(--radius)",
                background: selectedDepts.size > 0 ? "var(--accent-bg)" : "var(--bg-3)",
                color: selectedDepts.size > 0 ? "var(--accent)" : "var(--text-dimmer)",
                cursor: "pointer",
                transition: "all 0.1s",
                maxWidth: 200,
                whiteSpace: "nowrap",
                fontFamily: "var(--font)",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedDepts.size === 0
                  ? "All departments"
                  : `${selectedDepts.size} selected`}
              </span>
              <span style={{
                fontSize: 8,
                transition: "transform 0.1s",
                transform: deptDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}>
                ▼
              </span>
            </button>
            {deptDropdownOpen && (
              <div
                className="dropdown-animate"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 100,
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  minWidth: 200,
                  maxHeight: 320,
                  overflowY: "auto",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {/* Select All / Clear controls */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--border-dim)",
                  fontSize: 9,
                  fontFamily: "var(--font)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>
                  <button
                    onClick={() => setSelectedDepts(new Set(departments))}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-dimmer)",
                      fontFamily: "var(--font)",
                      fontSize: 9,
                      letterSpacing: "0.06em",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dimmer)"; }}
                  >
                    select all
                  </button>
                  <button
                    onClick={() => setSelectedDepts(new Set())}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-dimmer)",
                      fontFamily: "var(--font)",
                      fontSize: 9,
                      letterSpacing: "0.06em",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dimmer)"; }}
                  >
                    clear
                  </button>
                </div>
                {/* Department rows */}
                {departments.map((dept) => {
                  const checked = selectedDepts.has(dept);
                  return (
                    <button
                      key={dept}
                      onClick={() => toggleDept(dept)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 10px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "var(--font)",
                        color: checked ? "var(--text)" : "var(--text-dim)",
                        textAlign: "left",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-dim)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      {/* Checkbox */}
                      <span style={{
                        width: 14,
                        height: 14,
                        borderRadius: 2,
                        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                        background: checked ? "var(--accent-bg)" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: 10,
                        color: "var(--accent)",
                        transition: "all 0.1s",
                      }}>
                        {checked ? "✓" : ""}
                      </span>
                      <span style={{
                        flex: 1,
                        textTransform: "capitalize",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {dept}
                      </span>
                      <span style={{
                        fontSize: 10,
                        color: "var(--text-dimmer)",
                        background: "var(--bg-4)",
                        borderRadius: 10,
                        padding: "1px 6px",
                        flexShrink: 0,
                      }}>
                        {deptCounts[dept] ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Sort controls */}
          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
            {(["name", "lastRun", "runCount"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                style={{
                  padding: "4px 8px",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  border: "1px solid",
                  borderColor: sortKey === k ? "var(--accent)" : "var(--border-dim)",
                  borderRadius: "var(--radius-sm)",
                  background: sortKey === k ? "var(--accent-bg)" : "var(--bg-3)",
                  color: sortKey === k ? "var(--accent)" : "var(--text-dimmer)",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {k === "name" ? "name" : k === "lastRun" ? "last run" : "run count"}
              </button>
            ))}
          </div>
        </div>

        {/* Agent grid */}
        {loading ? (
          <div style={{ color: "var(--text-dimmer)", padding: "40px 0" }}>Loading...</div>
        ) : agents.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "64px 24px",
            textAlign: "center",
            gap: "16px",
          }}>
            <div style={{
              width: 48,
              height: 48,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dimmer)",
              fontSize: "22px",
              background: "var(--bg-2)",
            }}>
              ⬡
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                No agents yet
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dimmer)", maxWidth: "320px", lineHeight: "1.6" }}>
                Agents are reusable AI personas with defined skills, constraints, and tools. Create one to run it on any task.
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreate(true)}
            >
              + new agent
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--text-dimmer)", padding: "40px 0", fontSize: "12px" }}>
            No agents match your search.
          </div>
        ) : (
          Object.entries(grouped).sort().map(([dept, deptAgents]) => (
            <div key={dept} style={{ marginBottom: "24px" }}>
              <div style={{
                fontSize: "10px",
                color: "var(--text-dimmer)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "10px",
                paddingBottom: "6px",
                borderBottom: "1px solid var(--border-dim)",
              }}>
                {dept} — {deptAgents.length}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
                {deptAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    stats={allStats[agent.id]}
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("studio:open-agent", { detail: { id: agent.id } })
                      );
                    }}
                    onRun={() => navigate(`/run?agent=${agent.id}`)}
                    onDelete={() => deleteAgent(agent)}
                    onDuplicate={() => duplicateAgent(agent)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create agent modal */}
      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fade-in"
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              width: "440px",
              padding: "24px",
              display: "flex", flexDirection: "column", gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "-0.01em" }}>New Agent</span>
              <button onClick={() => setShowCreate(false)} style={{ color: "var(--text-dimmer)", fontSize: "14px", lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>Name *</span>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Frontend Reviewer"
                  autoFocus
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>Description</span>
                <input
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="What does this agent do?"
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>Department</span>
                <select value={createDept} onChange={(e) => setCreateDept(e.target.value)}>
                  {["engineering", "product", "design", "marketing", "sales", "operations", "pr", "general"].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>Task Template</span>
                <textarea
                  value={createTask}
                  onChange={(e) => setCreateTask(e.target.value)}
                  placeholder="Describe what this agent should do when run..."
                  rows={4}
                  style={{ resize: "vertical" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void handleCreate()}
                disabled={creating || !createName.trim()}
              >
                {creating ? "Creating..." : "Create agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name}"?`}
        message="This will permanently delete the agent file. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDeleteAgent()}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Agent detail panel */}
      {selected && (
        <div style={{
          width: "480px",
          minWidth: "480px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-2)",
        }}>
          {/* Panel header */}
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "2px" }}>
                .claude/agents/{selected.path}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* Tabs */}
              <div style={{ display: "flex", border: "1px solid var(--border-dim)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                {(["edit", "run", "gov"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: "4px 12px",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      background: tab === t ? "var(--accent-bg)" : "none",
                      border: "none",
                      borderRight: t !== "gov" ? "1px solid var(--border-dim)" : "none",
                      color: tab === t ? "var(--accent)" : "var(--text-dimmer)",
                      cursor: "pointer",
                      fontFamily: "var(--font)",
                      transition: "all 0.1s",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "edit" && (
                <button className="btn btn-primary" onClick={saveAgent} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
              <button className="btn" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
          </div>

          {/* EDIT tab */}
          {tab === "edit" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                style={{
                  flex: 1,
                  resize: "none",
                  border: "none",
                  borderRadius: 0,
                  background: "var(--bg)",
                  padding: "16px 20px",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                }}
              />
              {/* Quality guardrails panel (#32) */}
              {editContent && (
                <div style={{
                  borderTop: "1px solid var(--border-dim)",
                  background: "var(--bg-2)",
                  flexShrink: 0,
                }}>
                  {/* Panel header */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 14px",
                    borderBottom: "1px solid var(--border-dim)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 9,
                        fontFamily: "var(--font)",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 2,
                        color: overallColor,
                        background: hasErrors
                          ? "rgba(248,81,73,0.1)"
                          : hasWarnings
                          ? "rgba(210,153,34,0.1)"
                          : "rgba(63,185,80,0.1)",
                        border: `1px solid ${hasErrors ? "rgba(248,81,73,0.25)" : hasWarnings ? "rgba(210,153,34,0.25)" : "rgba(63,185,80,0.25)"}`,
                      }}>
                        {overallStatus}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)" }}>
                        {passingCount}/{skillChecks.length} checks
                      </span>
                    </div>
                    <button
                      onClick={() => setShowAllChecks((v) => !v)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 9,
                        fontFamily: "var(--font)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--text-dimmer)",
                        padding: 0,
                      }}
                    >
                      {showAllChecks ? "hide passing" : "show all"}
                    </button>
                  </div>
                  {/* Check rows */}
                  <div style={{ padding: "6px 0", maxHeight: 160, overflowY: "auto" }}>
                    {skillChecks
                      .filter((c) => showAllChecks || c.status !== "pass")
                      .map((c) => (
                        <div key={c.id} style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          padding: "3px 14px",
                          fontSize: 10,
                          fontFamily: "var(--font)",
                        }}>
                          <span style={{
                            flexShrink: 0,
                            marginTop: 1,
                            color: c.status === "pass"
                              ? "var(--accent)"
                              : c.status === "warn"
                              ? "var(--yellow)"
                              : "var(--red)",
                          }}>
                            {c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗"}
                          </span>
                          <span style={{
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: c.status === "pass"
                              ? "var(--text-dimmer)"
                              : c.status === "warn"
                              ? "var(--yellow)"
                              : "var(--red)",
                            flexShrink: 0,
                            fontSize: 9,
                            marginTop: 1,
                          }}>
                            {c.label}
                          </span>
                          <span style={{ color: "var(--text-dimmer)", fontSize: 10, lineHeight: "1.4" }}>
                            {c.detail}
                          </span>
                        </div>
                      ))}
                    {!showAllChecks && skillChecks.every((c) => c.status === "pass") && (
                      <div style={{ padding: "4px 14px", fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)", fontStyle: "italic" }}>
                        All checks passing
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Effectiveness panel (#66) */}
              {effectiveness && (
                <div style={{
                  borderTop: "1px solid var(--border-dim)",
                  background: "var(--bg-2)",
                  flexShrink: 0,
                  padding: "8px 14px",
                }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}>
                    <span style={{
                      fontSize: 9,
                      fontFamily: "var(--font)",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--text-dimmer)",
                    }}>
                      Effectiveness
                    </span>
                    {effectiveness.totalRuns === 0 ? (
                      <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)", fontStyle: "italic" }}>
                        No runs yet
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)" }}>
                        {effectiveness.totalRuns} run{effectiveness.totalRuns !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {effectiveness.totalRuns > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {/* Success rate bar */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 9, fontFamily: "var(--font)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dimmer)" }}>
                            Success Rate
                          </span>
                          <span style={{ fontSize: 9, fontFamily: "var(--font)", color: "var(--accent)" }}>
                            {Math.round(effectiveness.successRate * 100)}%
                          </span>
                        </div>
                        <div style={{
                          height: 4,
                          background: "var(--bg-3)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.round(effectiveness.successRate * 100)}%`,
                            background: "var(--accent)",
                            borderRadius: 2,
                            transition: "width 0.3s ease",
                          }} />
                        </div>
                      </div>
                      {/* Trend */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 9, fontFamily: "var(--font)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dimmer)" }}>
                          Trend
                        </span>
                        {effectiveness.recentTrend === "insufficient_data" ? (
                          <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)" }}>—</span>
                        ) : (
                          <span style={{
                            fontSize: 10,
                            fontFamily: "var(--font)",
                            fontWeight: 600,
                            color: effectiveness.recentTrend === "improving"
                              ? "var(--accent)"
                              : effectiveness.recentTrend === "degrading"
                              ? "var(--red)"
                              : "var(--yellow)",
                          }}>
                            {effectiveness.recentTrend === "improving" ? "↑" : effectiveness.recentTrend === "degrading" ? "↓" : "→"}{" "}
                            {effectiveness.recentTrend}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* RUN tab */}
          {tab === "run" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Controls */}
              <div style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-dim)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}>
                <textarea
                  value={runPrompt}
                  onChange={(e) => setRunPrompt(e.target.value)}
                  placeholder="Enter a prompt for this agent..."
                  disabled={running}
                  rows={3}
                  style={{
                    resize: "none",
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "8px 10px",
                    fontSize: "12px",
                    lineHeight: "1.5",
                    color: "var(--text)",
                    fontFamily: "var(--font)",
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {/* Model selector */}
                  <div ref={modelRef} style={{ position: "relative" }}>
                    <button
                      onClick={() => setModelOpen((v) => !v)}
                      disabled={running}
                      style={{
                        background: "none",
                        border: "1px solid var(--border-dim)",
                        color: "var(--text-dimmer)",
                        fontFamily: "var(--font)",
                        fontSize: "10px",
                        padding: "4px 10px",
                        cursor: running ? "not-allowed" : "pointer",
                        letterSpacing: "0.04em",
                        transition: "all 0.1s",
                        opacity: running ? 0.5 : 1,
                      }}
                    >
                      ▾ {currentModel.label}
                    </button>
                    {modelOpen && (
                      <div style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        zIndex: 200,
                        background: "var(--bg-3)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        minWidth: "160px",
                        overflow: "hidden",
                      }}>
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => { setRunModel(m.id); setModelOpen(false); }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              padding: "6px 10px",
                              background: "none",
                              border: "none",
                              borderLeft: m.id === runModel ? "2px solid var(--accent)" : "2px solid transparent",
                              color: m.id === runModel ? "var(--accent)" : "var(--text-dim)",
                              fontFamily: "var(--font)",
                              fontSize: "11px",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-4)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                          >
                            <span>{m.label}</span>
                            <span style={{ color: "var(--text-dimmer)", fontSize: "10px" }}>{m.note}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Approval required toggle */}
                  <button
                    onClick={() => setApprovalRequired((v) => !v)}
                    disabled={running}
                    title={approvalRequired ? "Tool approval required — click to disable" : "Click to require tool approval before run"}
                    style={{
                      background: approvalRequired ? "rgba(210,153,34,0.12)" : "none",
                      border: `1px solid ${approvalRequired ? "rgba(210,153,34,0.4)" : "var(--border-dim)"}`,
                      color: approvalRequired ? "var(--yellow)" : "var(--text-dimmer)",
                      fontFamily: "var(--font)",
                      fontSize: "9px",
                      padding: "4px 8px",
                      cursor: running ? "not-allowed" : "pointer",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      transition: "all 0.1s",
                      opacity: running ? 0.5 : 1,
                    }}
                  >
                    {approvalRequired ? "⚠ GATE ON" : "GATE"}
                  </button>

                  <div style={{ flex: 1 }} />

                  {running ? (
                    <button
                      onClick={stopRun}
                      style={{
                        background: "none",
                        border: "1px solid var(--red)",
                        color: "var(--red)",
                        fontFamily: "var(--font)",
                        fontSize: "10px",
                        padding: "4px 14px",
                        cursor: "pointer",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        transition: "all 0.1s",
                      }}
                    >
                      ■ STOP
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => void runAgent()}
                      disabled={!runPrompt.trim() || running}
                      style={{ fontSize: "10px", padding: "4px 14px" }}
                    >
                      Run
                    </button>
                  )}
                </div>
              </div>

              {/* Output area */}
              <div
                ref={outputRef}
                style={{
                  flex: 1,
                  overflow: "auto",
                  background: "var(--bg)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Run meta strip */}
                {runMeta && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 16px",
                    borderBottom: "1px solid var(--border-dim)",
                    fontSize: 10,
                    fontFamily: "var(--font)",
                    color: "var(--text-dimmer)",
                    background: "var(--bg-2)",
                    flexShrink: 0,
                  }}>
                    <span style={{
                      color: STATUS_BADGE[runStatus]?.color ?? "var(--text-dimmer)",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                    }}>
                      {STATUS_BADGE[runStatus]?.label}
                    </span>
                    <span>·</span>
                    <span>{currentModel.label}</span>
                    {runMeta.durationMs != null && (
                      <>
                        <span>·</span>
                        <span>{(runMeta.durationMs / 1000).toFixed(1)}s</span>
                      </>
                    )}
                    {runMeta.wordCount != null && (
                      <>
                        <span>·</span>
                        <span>{runMeta.wordCount.toLocaleString()} words</span>
                      </>
                    )}
                    {running && !loopDetected && (
                      <span style={{ color: "var(--accent)", marginLeft: "auto" }}>
                        ● streaming
                      </span>
                    )}
                    {running && loopDetected && (
                      <span style={{ color: "var(--yellow)", marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>⟳ LOOP ×{loopDetected.count}</span>
                        {loopDetected.count >= 3 && <span style={{ opacity: 0.7 }}>— auto-stopped</span>}
                      </span>
                    )}
                    {!running && failureClass && (
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ color: failureClass.color, fontWeight: 600, letterSpacing: "0.08em" }}>
                          {failureClass.label}
                        </span>
                        <span style={{ color: "var(--text-dimmer)" }}>—</span>
                        <span style={{ color: "var(--text-dimmer)" }}>{failureClass.detail}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Approval gate dialog */}
                {pendingApproval && (
                  <div style={{
                    padding: "20px",
                    borderBottom: "1px solid var(--border-dim)",
                    background: "rgba(210,153,34,0.05)",
                    flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--yellow)", fontFamily: "var(--font)", marginBottom: 8, letterSpacing: "0.06em" }}>
                      ⚠ TOOL APPROVAL REQUIRED
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}>
                      This agent may invoke the following tools:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                      {pendingApproval.tools.map((t) => (
                        <span key={t} style={{
                          padding: "2px 8px",
                          background: "rgba(56,139,253,0.1)",
                          border: "1px solid rgba(56,139,253,0.25)",
                          borderRadius: 2,
                          fontSize: 10,
                          fontFamily: "var(--font)",
                          color: "var(--blue)",
                          letterSpacing: "0.04em",
                        }}>{t}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => { pendingApprovalResolveRef.current?.(true); }}
                      >
                        Allow
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => { pendingApprovalResolveRef.current?.(false); }}
                        style={{ color: "var(--red)", borderColor: "var(--red)" }}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                )}

                {/* Structured output */}
                <div style={{ flex: 1, padding: "16px 20px", overflow: "auto" }}>
                  {running && !output && (
                    <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>
                      <span style={{ color: "var(--accent)" }}>●</span> Running...
                    </div>
                  )}

                  {segments.length > 0 && segments.map((seg, idx) => {
                    if (seg.type === "h1") return (
                      <div key={idx} style={{
                        fontSize: 15, fontWeight: 700, color: "var(--text)",
                        marginBottom: 8, marginTop: idx > 0 ? 20 : 0,
                        paddingBottom: 6, borderBottom: "1px solid var(--border-dim)",
                        fontFamily: "var(--font-ui, var(--font))",
                      }}>{seg.text}</div>
                    );
                    if (seg.type === "h2") return (
                      <div key={idx} style={{
                        fontSize: 12, fontWeight: 600, color: "var(--text)",
                        marginBottom: 6, marginTop: idx > 0 ? 16 : 0,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        fontFamily: "var(--font)",
                      }}>{seg.text}</div>
                    );
                    if (seg.type === "h3") return (
                      <div key={idx} style={{
                        fontSize: 11, fontWeight: 600, color: "var(--accent)",
                        marginBottom: 4, marginTop: idx > 0 ? 12 : 0,
                        fontFamily: "var(--font)",
                      }}>{seg.text}</div>
                    );
                    if (seg.type === "code") return (
                      <div key={idx} style={{
                        background: "var(--bg-3)",
                        border: "1px solid var(--border-dim)",
                        borderRadius: 2,
                        margin: "10px 0",
                      }}>
                        {seg.lang !== "text" && (
                          <div style={{
                            padding: "3px 10px",
                            fontSize: 9,
                            color: "var(--text-dimmer)",
                            borderBottom: "1px solid var(--border-dim)",
                            fontFamily: "var(--font)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}>{seg.lang}</div>
                        )}
                        <pre style={{
                          margin: 0, padding: "10px 12px",
                          fontSize: 11, lineHeight: "1.55",
                          color: "var(--text)", fontFamily: "var(--font)",
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                          overflowX: "auto",
                        }}>{seg.content}</pre>
                      </div>
                    );
                    if (seg.type === "list") return (
                      <ul key={idx} style={{
                        margin: "6px 0", paddingLeft: 0, listStyle: "none",
                      }}>
                        {seg.items.map((item, ii) => (
                          <li key={ii} style={{
                            display: "flex", gap: 8, alignItems: "flex-start",
                            fontSize: 12, lineHeight: "1.55",
                            color: "var(--text-dim)", fontFamily: "var(--font-ui, var(--font))",
                            marginBottom: 3,
                          }}>
                            <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>›</span>
                            <span>{renderInline(item)}</span>
                          </li>
                        ))}
                      </ul>
                    );
                    if (seg.type === "para") return (
                      <p key={idx} style={{
                        margin: "0 0 8px",
                        fontSize: 12, lineHeight: "1.65",
                        color: "var(--text-dim)", fontFamily: "var(--font-ui, var(--font))",
                      }}>{renderInline(seg.text)}</p>
                    );
                    if (seg.type === "tool_event") return (
                      <div key={idx} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "3px 8px",
                        background: "rgba(56,139,253,0.06)",
                        border: "1px solid rgba(56,139,253,0.18)",
                        borderRadius: 2,
                        margin: "3px 0",
                      }}>
                        <span style={{ color: "var(--blue)", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", fontFamily: "var(--font)", flexShrink: 0 }}>
                          {seg.tool}
                        </span>
                        <span style={{ color: "var(--text-dimmer)", fontSize: 10, fontFamily: "var(--font)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {seg.detail}
                        </span>
                      </div>
                    );
                    return null;
                  })}

                  {running && output && (
                    <span style={{ color: "var(--accent)", fontSize: 12 }}>▋</span>
                  )}

                  {!running && !output && runStatus === "idle" && (
                    <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>
                      Output will appear here.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GOV tab */}
          {tab === "gov" && (
            <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
              {!govInfo ? (
                <div style={{ color: "var(--text-dimmer)", fontSize: 11 }}>No agent selected.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Role */}
                  <GovSection label="Role">
                    <div style={{ fontSize: 12, color: govInfo.role ? "var(--text)" : "var(--text-dimmer)", fontStyle: govInfo.role ? "normal" : "italic" }}>
                      {govInfo.role ?? "No role definition found"}
                    </div>
                  </GovSection>

                  {/* Risk class */}
                  <GovSection label="Risk Class">
                    <span style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      padding: "2px 8px",
                      borderRadius: 2,
                      color: govInfo.riskClass === "HIGH" ? "var(--red)" : govInfo.riskClass === "MEDIUM" ? "var(--yellow)" : "var(--accent)",
                      background: govInfo.riskClass === "HIGH" ? "var(--red-bg)" : govInfo.riskClass === "MEDIUM" ? "rgba(210,153,34,0.1)" : "var(--accent-bg)",
                      border: `1px solid ${govInfo.riskClass === "HIGH" ? "rgba(248,81,73,0.25)" : govInfo.riskClass === "MEDIUM" ? "rgba(210,153,34,0.25)" : "rgba(63,185,80,0.25)"}`,
                    }}>
                      {govInfo.riskClass}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-dimmer)", marginLeft: 8 }}>
                      {govInfo.riskClass === "HIGH" ? "payments or billing detected" : govInfo.riskClass === "MEDIUM" ? "auth + database detected" : "no high-risk patterns"}
                    </span>
                  </GovSection>

                  {/* Tools */}
                  <GovSection label="Tools Referenced">
                    {govInfo.tools.length === 0 ? (
                      <div style={{ fontSize: 11, color: "var(--text-dimmer)", fontStyle: "italic" }}>None detected</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {govInfo.tools.map((t) => (
                          <span key={t} style={{
                            fontSize: 10, padding: "2px 7px",
                            background: "var(--bg-4)", color: "var(--text-dim)",
                            border: "1px solid var(--border-dim)", borderRadius: 2,
                            fontFamily: "var(--font)",
                          }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </GovSection>

                  {/* Constraints */}
                  <GovSection label="Hard Constraints">
                    {govInfo.constraints.length === 0 ? (
                      <div style={{ fontSize: 11, color: "var(--text-dimmer)", fontStyle: "italic" }}>None found</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {govInfo.constraints.map((c, i) => (
                          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
                            <span style={{ color: "var(--red)", flexShrink: 0 }}>✕</span>
                            <span style={{ color: "var(--text-dim)", lineHeight: "1.4" }}>{c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </GovSection>

                  {/* Non-delegation */}
                  {govInfo.nonDelegation.length > 0 && (
                    <GovSection label="Non-Delegation Zones">
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {govInfo.nonDelegation.map((n, i) => (
                          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
                            <span style={{ color: "var(--yellow)", flexShrink: 0 }}>⚠</span>
                            <span style={{ color: "var(--text-dim)", lineHeight: "1.4" }}>{n}</span>
                          </div>
                        ))}
                      </div>
                    </GovSection>
                  )}

                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GovSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: "var(--text-dimmer)", textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 6, fontFamily: "var(--font)",
      }}>{label}</div>
      {children}
    </div>
  );
}
