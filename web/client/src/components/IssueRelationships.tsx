import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "./Toasts";
import type { Issue } from "./IssueComponents";

// ── Types ──────────────────────────────────────────────────────────────────────

export type RelationshipType = "blocks" | "blocked_by" | "relates_to" | "duplicates";

export interface IssueRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
}

const REL_KEY = "hm-issue-relationships";

const REL_LABELS: Record<RelationshipType, string> = {
  blocks: "Blocks",
  blocked_by: "Blocked by",
  relates_to: "Relates to",
  duplicates: "Duplicates",
};

const REL_COLORS: Record<RelationshipType, string> = {
  blocks: "var(--error, #f87171)",
  blocked_by: "var(--error, #f87171)",
  relates_to: "var(--blue, #6ea8fe)",
  duplicates: "var(--yellow, #e3c16f)",
};

// ── Storage ────────────────────────────────────────────────────────────────────

export function loadRelationships(): IssueRelationship[] {
  try { return JSON.parse(localStorage.getItem(REL_KEY) ?? "[]") as IssueRelationship[]; }
  catch { return []; }
}

function saveRelationships(rels: IssueRelationship[]) {
  localStorage.setItem(REL_KEY, JSON.stringify(rels));
}

export function addRelationship(rel: Omit<IssueRelationship, "id">): IssueRelationship {
  const next: IssueRelationship = { ...rel, id: crypto.randomUUID() };
  const all = loadRelationships();
  // Prevent exact duplicates
  const exists = all.some(r => r.sourceId === rel.sourceId && r.targetId === rel.targetId && r.type === rel.type);
  if (!exists) saveRelationships([...all, next]);
  return next;
}

export function removeRelationship(id: string) {
  saveRelationships(loadRelationships().filter(r => r.id !== id));
}

// ── Link Issue Panel (used in IssueDetail) ─────────────────────────────────────

export function RelationshipsPanel({ issue, allIssues }: {
  issue: Issue;
  allIssues: Issue[];
}) {
  const [rels, setRels] = useState<IssueRelationship[]>(() => loadRelationships());
  const [showLinker, setShowLinker] = useState(false);
  const [query, setQuery] = useState("");
  const [relType, setRelType] = useState<RelationshipType>("relates_to");
  const [pickedId, setPickedId] = useState("");

  const myRels = rels.filter(r => r.sourceId === issue.id || r.targetId === issue.id);

  const refresh = () => setRels(loadRelationships());

  const handleAdd = () => {
    if (!pickedId) return;
    if (pickedId === issue.id) { toast.error("Cannot link issue to itself"); return; }
    addRelationship({ sourceId: issue.id, targetId: pickedId, type: relType });
    refresh();
    setShowLinker(false);
    setQuery("");
    setPickedId("");
    toast.success("Link added");
  };

  const handleRemove = (id: string) => {
    removeRelationship(id);
    refresh();
  };

  const searchResults = query.trim()
    ? allIssues.filter(i =>
        i.id !== issue.id &&
        (i.title.toLowerCase().includes(query.toLowerCase()) || i.identifier.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 8)
    : [];

  const getOther = (rel: IssueRelationship): Issue | undefined => {
    const otherId = rel.sourceId === issue.id ? rel.targetId : rel.sourceId;
    return allIssues.find(i => i.id === otherId);
  };

  const getLabel = (rel: IssueRelationship): string => {
    if (rel.sourceId === issue.id) return REL_LABELS[rel.type];
    // Invert for incoming
    const inv: Record<RelationshipType, string> = {
      blocks: "Blocked by",
      blocked_by: "Blocks",
      relates_to: "Relates to",
      duplicates: "Duplicated by",
    };
    return inv[rel.type];
  };

  const getColor = (rel: IssueRelationship): string => {
    return REL_COLORS[rel.type];
  };

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Relationships
        </span>
        {myRels.length > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 600, color: "var(--accent)",
            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
            borderRadius: 8, padding: "0 5px", lineHeight: "16px",
          }}>
            {myRels.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowLinker(v => !v)}
          style={{
            fontSize: 10, background: "none", border: "1px solid var(--border)",
            color: "var(--text-muted)", borderRadius: 3, padding: "1px 7px",
            cursor: "pointer",
          }}
        >
          + Link Issue
        </button>
      </div>

      {showLinker && (
        <div style={{
          padding: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", marginBottom: 8, display: "flex", flexDirection: "column", gap: 6,
        }}>
          <select
            value={relType}
            onChange={e => setRelType(e.target.value as RelationshipType)}
            style={{
              background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
              borderRadius: 3, fontSize: 11, padding: "3px 6px", cursor: "pointer",
            }}
          >
            {(Object.keys(REL_LABELS) as RelationshipType[]).map(t => (
              <option key={t} value={t}>{REL_LABELS[t]}</option>
            ))}
          </select>
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setPickedId(""); }}
            placeholder="Search issues..."
            style={{
              background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
              borderRadius: 3, fontSize: 11, padding: "4px 8px", outline: "none", width: "100%",
              boxSizing: "border-box",
            }}
          />
          {searchResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto" }}>
              {searchResults.map(i => (
                <button
                  key={i.id}
                  onClick={() => { setPickedId(i.id); setQuery(i.identifier + " " + i.title); }}
                  style={{
                    textAlign: "left", background: pickedId === i.id ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--bg)",
                    border: `1px solid ${pickedId === i.id ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 3, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--text)",
                    display: "flex", gap: 8, alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{i.identifier}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setShowLinker(false); setQuery(""); setPickedId(""); }}
            >Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAdd}
              disabled={!pickedId}
            >Add</button>
          </div>
        </div>
      )}

      {myRels.length === 0 && !showLinker && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", paddingBottom: 6 }}>No relationships.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {myRels.map(rel => {
          const other = getOther(rel);
          return (
            <div key={rel.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 8px", background: "var(--bg-elevated)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                background: `color-mix(in srgb, ${getColor(rel)} 15%, transparent)`,
                color: getColor(rel),
                border: `1px solid color-mix(in srgb, ${getColor(rel)} 30%, transparent)`,
                whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase",
              }}>
                {getLabel(rel)}
              </span>
              {other ? (
                <>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>{other.identifier}</span>
                  <span style={{ flex: 1, fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{other.title}</span>
                </>
              ) : (
                <span style={{ flex: 1, fontSize: 11, color: "var(--text-muted)" }}>Unknown issue</span>
              )}
              <button
                onClick={() => handleRemove(rel.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
                title="Remove link"
              >×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Force graph ────────────────────────────────────────────────────────────────

interface NodeState {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const REPULSION = 4000;
const SPRING_K = 0.03;
const SPRING_REST = 140;
const DAMPING = 0.82;
const NODE_R = 28;
const TICK_DT = 0.016;
const SIM_STEPS_PER_FRAME = 3;

function runPhysics(nodes: NodeState[], edges: { s: string; t: string }[], width: number, height: number): NodeState[] {
  let ns = nodes.map(n => ({ ...n }));

  for (let step = 0; step < SIM_STEPS_PER_FRAME; step++) {
    // Repulsion
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x;
        const dy = ns[j].y - ns[i].y;
        const dist2 = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(dist2);
        const force = REPULSION / dist2;
        const fx = (dx / dist) * force * TICK_DT;
        const fy = (dy / dist) * force * TICK_DT;
        ns[i].vx -= fx;
        ns[i].vy -= fy;
        ns[j].vx += fx;
        ns[j].vy += fy;
      }
    }

    // Spring attraction
    for (const e of edges) {
      const si = ns.findIndex(n => n.id === e.s);
      const ti = ns.findIndex(n => n.id === e.t);
      if (si < 0 || ti < 0) continue;
      const dx = ns[ti].x - ns[si].x;
      const dy = ns[ti].y - ns[si].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const stretch = dist - SPRING_REST;
      const force = SPRING_K * stretch;
      const fx = (dx / dist) * force * TICK_DT;
      const fy = (dy / dist) * force * TICK_DT;
      ns[si].vx += fx;
      ns[si].vy += fy;
      ns[ti].vx -= fx;
      ns[ti].vy -= fy;
    }

    // Integrate + damp + clamp
    for (const n of ns) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x = Math.max(NODE_R + 4, Math.min(width - NODE_R - 4, n.x + n.vx));
      n.y = Math.max(NODE_R + 4, Math.min(height - NODE_R - 4, n.y + n.vy));
    }
  }

  return ns;
}

export function RelationshipGraph({ issues, focusIssueId, onSelectIssue }: {
  issues: Issue[];
  focusIssueId?: string;
  onSelectIssue: (id: string) => void;
}) {
  const [rels] = useState<IssueRelationship[]>(() => loadRelationships());
  const [nodes, setNodes] = useState<NodeState[]>([]);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(420);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);

  // Build visible issue set: only issues that appear in at least one rel, plus focused issue
  const relevantIds = new Set<string>();
  for (const r of rels) {
    relevantIds.add(r.sourceId);
    relevantIds.add(r.targetId);
  }
  if (focusIssueId) relevantIds.add(focusIssueId);

  const visibleIssues = issues.filter(i => relevantIds.has(i.id));

  // Init nodes
  useEffect(() => {
    const cx = width / 2;
    const cy = height / 2;
    setNodes(visibleIssues.map((i, idx) => {
      const angle = (idx / visibleIssues.length) * Math.PI * 2;
      const r = Math.min(width, height) * 0.3;
      return {
        id: i.id,
        label: i.title.slice(0, 20),
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIssues.length, width, height]);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      setWidth(e.contentRect.width);
      setHeight(e.contentRect.height);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Animation loop
  const nodesRef = useRef<NodeState[]>(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const edges = rels
    .filter(r => relevantIds.has(r.sourceId) && relevantIds.has(r.targetId))
    .map(r => ({ s: r.sourceId, t: r.targetId, type: r.type }));

  const tick = useCallback(() => {
    if (!dragRef.current) {
      setNodes(prev => runPhysics(prev, edges, width, height));
    }
    animRef.current = requestAnimationFrame(tick);
  }, [edges, width, height]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current != null) cancelAnimationFrame(animRef.current); };
  }, [tick]);

  const onMouseDown = (e: React.MouseEvent<SVGCircleElement>, id: string) => {
    e.preventDefault();
    const svgRect = (e.currentTarget.closest("svg") as SVGElement).getBoundingClientRect();
    const node = nodesRef.current.find(n => n.id === id);
    if (!node) return;
    dragRef.current = { id, ox: e.clientX - svgRect.left - node.x, oy: e.clientY - svgRect.top - node.y };
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - svgRect.left - dragRef.current.ox;
    const my = e.clientY - svgRect.top - dragRef.current.oy;
    const { id } = dragRef.current;
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: mx, y: my, vx: 0, vy: 0 } : n));
  };

  const onMouseUp = () => { dragRef.current = null; };

  if (visibleIssues.length === 0) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
        No linked issues yet. Add relationships from an issue detail view.
      </div>
    );
  }

  const arrowId = (type: RelationshipType) => `arrow-${type}`;

  return (
    <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ display: "block", cursor: dragRef.current ? "grabbing" : "default" }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          {(Object.keys(REL_COLORS) as RelationshipType[]).map(type => (
            <marker
              key={type}
              id={arrowId(type)}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill={REL_COLORS[type]} />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const src = nodes.find(n => n.id === e.s);
          const tgt = nodes.find(n => n.id === e.t);
          if (!src || !tgt) return null;
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const ex = tgt.x - (dx / dist) * (NODE_R + 10);
          const ey = tgt.y - (dy / dist) * (NODE_R + 10);
          return (
            <line
              key={i}
              x1={src.x}
              y1={src.y}
              x2={ex}
              y2={ey}
              stroke={REL_COLORS[e.type]}
              strokeWidth={1.5}
              strokeOpacity={0.7}
              markerEnd={`url(#${arrowId(e.type)})`}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const isFocused = n.id === focusIssueId;
          return (
            <g key={n.id} style={{ cursor: "pointer" }} onClick={() => onSelectIssue(n.id)}>
              <circle
                cx={n.x}
                cy={n.y}
                r={NODE_R}
                fill={isFocused ? "color-mix(in srgb, var(--accent) 25%, var(--bg-elevated))" : "var(--bg-elevated)"}
                stroke={isFocused ? "var(--accent)" : "var(--border)"}
                strokeWidth={isFocused ? 2 : 1}
                onMouseDown={e => onMouseDown(e, n.id)}
                style={{ cursor: "grab" }}
              />
              <text
                x={n.x}
                y={n.y}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontSize: 9,
                  fill: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {n.label.length > 16 ? n.label.slice(0, 14) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 10, right: 10,
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", padding: "6px 10px",
        display: "flex", flexDirection: "column", gap: 3,
      }}>
        {(Object.keys(REL_LABELS) as RelationshipType[]).map(t => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 2, background: REL_COLORS[t] }} />
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{REL_LABELS[t]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
