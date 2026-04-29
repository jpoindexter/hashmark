import { useState } from "react";

export interface ToolGroupEntry {
  name: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  isPending?: boolean;
}

// ── Display helpers ─────────────────────────────────────────────────────────

function getToolDisplay(name: string, input?: Record<string, unknown>): { label: string; path: string } {
  const t = name.toLowerCase();
  if (t === "glob") return { label: "Glob", path: String(input?.pattern ?? "") };
  if (t === "grep") {
    const base = String(input?.pattern ?? "");
    const extra = input?.path ? ` · ${input.path}` : input?.glob ? ` · ${input.glob}` : "";
    return { label: "Search", path: `"${base}"${extra}` };
  }
  if (t === "read") return { label: "Read", path: String(input?.file_path ?? "") };
  if (t === "edit" || t === "multi_edit") return { label: "Edit", path: String(input?.file_path ?? "") };
  if (t === "write") return { label: "Write", path: String(input?.file_path ?? "") };
  if (t === "bash") {
    const cmd = String(input?.command ?? "");
    return { label: "Bash", path: cmd.length > 60 ? cmd.slice(0, 58) + "…" : cmd };
  }
  if (t === "web_fetch") return { label: "Fetch", path: String(input?.url ?? "") };
  if (t === "web_search") return { label: "Search", path: String(input?.query ?? "") };
  if (t === "agent") {
    const p = String(input?.description ?? input?.prompt ?? "");
    return { label: "Agent", path: p.length > 40 ? p.slice(0, 38) + "…" : p };
  }
  if (t === "todowrite" || t === "todoread") return { label: "Todos", path: "" };
  return { label: name, path: "" };
}

type Category = "reading" | "editing" | "running" | "other";

function getCategory(name: string): Category {
  const t = name.toLowerCase();
  if (["read", "grep", "glob", "ls", "web_fetch", "web_search"].includes(t)) return "reading";
  if (["edit", "multi_edit", "write"].includes(t)) return "editing";
  if (["bash", "agent"].includes(t)) return "running";
  return "other";
}

const CATEGORY_LABEL: Record<Category, string> = { reading: "Reading", editing: "Editing", running: "Running", other: "Tools" };
const CATEGORY_COLOR: Record<Category, string> = {
  reading: "var(--blue)",
  editing: "var(--yellow)",
  running: "var(--text-dim)",
  other: "var(--text-muted)",
};

function getDotColor(name: string, isError: boolean, isPending: boolean): string {
  if (isError) return "var(--red)";
  if (isPending) return "var(--yellow)";
  const t = name.toLowerCase();
  if (["read", "grep", "glob", "ls", "web_fetch", "web_search"].includes(t)) return "var(--blue)";
  if (["edit", "multi_edit"].includes(t)) return "var(--yellow)";
  if (t === "write") return "var(--accent)";
  return "var(--text-dim)";
}

function getResultSummary(name: string, input?: Record<string, unknown>, result?: string, isError?: boolean): string {
  if (isError) return "err";
  if (!result) return "";
  const t = name.toLowerCase();
  if (t === "read") return `✓ ${result.split("\n").length} lines`;
  if (t === "glob") {
    const lines = result.trim().split("\n").filter(Boolean);
    return `✓ ${lines.length} files`;
  }
  if (t === "grep") {
    const matches = result.trim().split("\n").filter(Boolean).length;
    return `✓ ${matches} matches`;
  }
  if (t === "edit" || t === "multi_edit") {
    const old_ = String(input?.old_string ?? "");
    const new_ = String(input?.new_string ?? "");
    const added = new_ ? new_.split("\n").length : 0;
    const removed = old_ ? old_.split("\n").length : 0;
    if (added > 0 || removed > 0) return `+${added} −${removed}`;
    return "✓ saved";
  }
  if (t === "write") return "✓ written";
  if (t === "bash") return result.trim().length > 0 ? "✓ done" : "✓";
  return "✓";
}

function isFileTool(name: string): boolean {
  return ["read", "edit", "multi_edit", "write"].includes(name.toLowerCase());
}

// ── ToolLine ────────────────────────────────────────────────────────────────

function ToolLine({ entry, dim }: { entry: ToolGroupEntry; dim?: boolean }) {
  const { label, path } = getToolDisplay(entry.name, entry.input);
  const isError = entry.isError ?? false;
  const isPending = entry.isPending ?? false;
  const dotColor = getDotColor(entry.name, isError, isPending);
  const resultText = isPending ? "" : getResultSummary(entry.name, entry.input, entry.result, isError);
  const resultColor = isError ? "var(--red)" : "var(--green)";

  // Split path into dir + filename for two-tone rendering
  const parts = path.split("/");
  const filename = parts[parts.length - 1] ?? path;
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
  const trimmedDir = dir.length > 28 ? "…/" : dir;
  const isFile = isFileTool(entry.name);

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "2px 0",
      fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5,
      whiteSpace: "nowrap", minWidth: 0,
    }}>
      {isPending ? (
        <span style={{
          display: "inline-block", width: 7, height: 7, borderRadius: "50%",
          border: "1.5px solid var(--yellow)", borderTopColor: "transparent",
          animation: "spin 0.7s linear infinite", marginRight: 8, flexShrink: 0,
        }} />
      ) : (
        <span style={{ fontSize: 7, marginRight: 8, flexShrink: 0, color: dotColor, lineHeight: 1 }}>●</span>
      )}

      <span style={{
        fontWeight: 600, minWidth: 42, marginRight: 10, flexShrink: 0,
        color: "var(--text-dim)",
        ...(isPending ? {
          backgroundImage: "linear-gradient(to right, var(--shimmer-gold), var(--text-dim) 50%, var(--shimmer-gold))",
          backgroundSize: "200% auto",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          animation: "shimmer-sweep 1.6s linear infinite",
        } : {}),
      }}>
        {label}
      </span>

      {path && (
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, marginRight: 8, display: "flex", alignItems: "center" }}>
          {isFile && trimmedDir && (
            <span style={{ color: "var(--text-muted)", flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{trimmedDir}</span>
          )}
          <span style={{ color: isFile ? "var(--text-dim)" : "var(--text-muted)", flexShrink: 0 }}>
            {isFile ? filename : path.length > 60 ? path.slice(0, 58) + "…" : path}
          </span>
        </span>
      )}
      {!path && <span style={{ flex: 1 }} />}

      {resultText && !isPending && (
        <span style={{ fontSize: 10, flexShrink: 0, color: isError ? "var(--red)" : "var(--green)", fontFamily: "var(--font-mono)" }}>
          {resultText}
        </span>
      )}
    </div>
  );
}

// ── CategoryDivider ─────────────────────────────────────────────────────────

function CategoryDivider({ category }: { category: Category }) {
  const color = CATEGORY_COLOR[category];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
      userSelect: "none", padding: "3px 0", color,
      fontFamily: "var(--font-sans)",
    }}>
      <span style={{ flex: 1, height: 1, background: color, opacity: 0.25 }} />
      {CATEGORY_LABEL[category]}
      <span style={{ flex: 1, height: 1, background: color, opacity: 0.25 }} />
    </div>
  );
}

// ── ToolGroup ───────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5;

export function ToolGroup({ entries }: { entries: ToolGroupEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  // Group by category preserving insertion order
  const order: Category[] = [];
  const grouped = new Map<Category, ToolGroupEntry[]>();
  for (const e of entries) {
    const cat = getCategory(e.name);
    if (!grouped.has(cat)) { order.push(cat); grouped.set(cat, []); }
    grouped.get(cat)!.push(e);
  }

  const total = entries.length;
  const shouldCollapse = total > MAX_VISIBLE && !expanded;
  let shownCount = 0;

  return (
    <div style={{ margin: "4px 0 6px" }}>
      {order.map(cat => {
        const items = grouped.get(cat)!;
        const visibleItems = shouldCollapse ? items.slice(0, Math.max(0, MAX_VISIBLE - shownCount)) : items;
        const prevCount = shownCount;
        shownCount += visibleItems.length;
        if (prevCount >= MAX_VISIBLE && shouldCollapse) return null;
        if (visibleItems.length === 0) return null;
        return (
          <div key={cat}>
            {order.length > 1 && <CategoryDivider category={cat} />}
            {visibleItems.map((e, i) => (
              <ToolLine key={i} entry={e} dim={false} />
            ))}
          </div>
        );
      })}
      {shouldCollapse && total - MAX_VISIBLE > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "2px 0",
            fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--text-muted)",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--text-dim)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          ··· {total - MAX_VISIBLE} more
        </button>
      )}
      <div style={{ height: 1, background: "var(--border)", opacity: 0.5, margin: "3px 0 0" }} />
    </div>
  );
}
