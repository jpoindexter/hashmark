import { useState } from "react";
import React from "react";
export { ToolIcon } from "./ToolIcon";
import { parseBashStatus, computeDiffStats, parseGrepResult } from "../lib/toolParsers";
export { parseBashStatus, computeDiffStats, parseTodosFromResult } from "../lib/toolParsers";
export type { TodoItem, GrepGroup } from "../lib/toolParsers";
import type { GrepGroup, TodoItem } from "../lib/toolParsers";

export function renderDiff(content: string): React.ReactNode {
  return content.split("\n").map((line, i) => {
    const isAdd = line.startsWith("+") && !line.startsWith("+++");
    const isDel = line.startsWith("-") && !line.startsWith("---");
    return (
      <div key={i} style={{
        background: isAdd ? "color-mix(in srgb, var(--green) 12%, transparent)"
                  : isDel ? "color-mix(in srgb, var(--red) 12%, transparent)"
                  : "none",
        color: isAdd ? "var(--green)" : isDel ? "var(--red)" : "var(--text-dim)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        padding: "0 6px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}>{line || " "}</div>
    );
  });
}

export function FilePill({ path }: { path: string }) {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] || path;
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      padding: "1px 6px", borderRadius: "var(--radius-sm)",
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      fontFamily: "var(--font-mono)", fontSize: 10,
      maxWidth: 220, overflow: "hidden",
    }}>
      {dir && <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>{dir}</span>}
      <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{filename}</span>
    </span>
  );
}

export function DiffStats({ added, removed }: { added: number; removed: number }) {
  if (added === 0 && removed === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, fontSize: 10, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
      {added > 0 && <span style={{ color: "var(--green)" }}>+{added}</span>}
      {removed > 0 && <span style={{ color: "var(--red)" }}>-{removed}</span>}
    </span>
  );
}

export function FileList({ content }: { content: string }) {
  const files = content.trim().split("\n").filter(Boolean);
  if (!files.length) return <span style={{ fontSize: 10, color: "var(--text-muted)" }}>No matches</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto" }}>
      {files.map((f, i) => <FilePill key={i} path={f} />)}
    </div>
  );
}

export function TodoList({ todos }: { todos: TodoItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {todos.map((t, i) => {
        const isDone = t.status === "completed";
        const isActive = t.status === "in_progress";
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <span style={{
              color: isDone ? "var(--green)" : isActive ? "var(--yellow)" : "var(--text-muted)",
              flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 1,
            }}>
              {isDone ? "✓" : isActive ? "◉" : "○"}
            </span>
            <span style={{
              fontSize: 11, color: isDone ? "var(--text-muted)" : "var(--text-dim)",
              textDecoration: isDone ? "line-through" : "none",
              fontFamily: "var(--font-sans)", lineHeight: 1.4,
            }}>{t.content}</span>
          </div>
        );
      })}
    </div>
  );
}

export function GrepResult({ content }: { content: string }) {
  const [openFiles, setOpenFiles] = useState<Set<string>>(() => new Set());
  const groups = parseGrepResult(content);

  if (groups.length === 0) return <span style={{ fontSize: 10, color: "var(--text-muted)" }}>No matches</span>;

  if (groups.length === 1 && !groups[0].file) {
    return (
      <pre style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 240, overflow: "auto" }}>
        {content}
      </pre>
    );
  }

  const toggle = (file: string) => setOpenFiles(s => { const n = new Set(s); n.has(file) ? n.delete(file) : n.add(file); return n; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {groups.map((g, i) => {
        const open = openFiles.has(g.file);
        return (
          <div key={i}>
            <div
              onClick={() => toggle(g.file)}
              style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 0", userSelect: "none" }}
            >
              <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{open ? "▾" : "▸"}</span>
              <FilePill path={g.file} />
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{g.matches.length} match{g.matches.length !== 1 ? "es" : ""}</span>
            </div>
            {open && (
              <div style={{ marginLeft: 14, borderLeft: "1px solid var(--border)", paddingLeft: 8, marginBottom: 4 }}>
                {g.matches.map((m, j) => (
                  <div key={j} style={{ display: "flex", gap: 6, fontSize: 10, lineHeight: 1.5 }}>
                    {m.line != null && <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0, minWidth: 28, textAlign: "right" }}>{m.line}</span>}
                    <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{m.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function formatLabelNode(name: string, input?: Record<string, unknown>, result?: string): React.ReactNode {
  const verb = (v: string) => <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 11 }}>{v}</span>;
  const dim = (v: string) => <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{v}</span>;

  if (!input) return dim(name);

  switch (name) {
    case "bash": {
      const cmd = String(input.command ?? "").slice(0, 64);
      const bgStatus = parseBashStatus(result);
      return (
        <>
          {dim("$ ")}
          <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{cmd}</span>
          {bgStatus && (
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: "var(--radius-sm)", flexShrink: 0, fontFamily: "var(--font-sans)",
              background: bgStatus === "running" ? "var(--bg-warning)" : "var(--bg-success)",
              color: bgStatus === "running" ? "var(--yellow)" : "var(--green)",
              border: `1px solid ${bgStatus === "running" ? "color-mix(in srgb, var(--yellow) 30%, transparent)" : "color-mix(in srgb, var(--green) 30%, transparent)"}`,
            }}>{bgStatus}</span>
          )}
        </>
      );
    }
    case "write": {
      const fp = String(input.file_path ?? "");
      const content = String(input.content ?? "");
      const lines = content ? content.split("\n").length : 0;
      return (
        <>
          {verb(`Write${lines ? ` ${lines} lines` : ""}`)}
          <FilePill path={fp} />
        </>
      );
    }
    case "read": {
      const fp = String(input.file_path ?? "");
      return (
        <>
          {verb("Read")}
          <FilePill path={fp} />
        </>
      );
    }
    case "edit": {
      const fp = String(input.file_path ?? "");
      const stats = result ? computeDiffStats(result) : null;
      return (
        <>
          {verb("Edit")}
          <FilePill path={fp} />
          {stats && (stats.added > 0 || stats.removed > 0) && <DiffStats added={stats.added} removed={stats.removed} />}
        </>
      );
    }
    case "glob": {
      const pat = String(input.pattern ?? "");
      const resultCount = result ? result.split("\n").filter(Boolean).length : null;
      return (
        <>
          {verb(`Glob${resultCount != null ? ` (${resultCount})` : ""}`)}
          <FilePill path={pat} />
        </>
      );
    }
    case "grep": {
      const pat = String(input.pattern ?? "");
      return (
        <>
          {verb("Search")}
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{pat}</span>
        </>
      );
    }
    case "web_search":
    case "web_fetch": {
      const q = String(input.query ?? input.url ?? "").slice(0, 60);
      return (
        <>
          {verb(name === "web_search" ? "Web Search" : "Web Fetch")}
          <span style={{ color: "var(--text-muted)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{q}</span>
        </>
      );
    }
    case "todowrite":
    case "todoread": {
      const todos = (Array.isArray(input.todos) ? input.todos : []) as TodoItem[];
      const completed = todos.filter(t => t.status === "completed").length;
      const inProgress = todos.find(t => t.status === "in_progress");
      const allDone = todos.length > 0 && completed === todos.length;
      const label = allDone ? "Todo completed" : inProgress ? "Todo started" : "Todos";
      const summary = inProgress
        ? inProgress.content.slice(0, 50)
        : todos.length > 0 ? `${completed}/${todos.length}` : "";
      return (
        <>
          {verb(label)}
          {summary && <span style={{ color: "var(--text-muted)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{summary}</span>}
        </>
      );
    }
    case "multi_edit": {
      const fp = String(input.file_path ?? "");
      const edits = Array.isArray(input.edits) ? input.edits as Array<{ old_string?: string; new_string?: string }> : [];
      const totalAdded = edits.reduce((s, e) => s + (e.new_string?.split("\n").length ?? 0), 0);
      const totalRemoved = edits.reduce((s, e) => s + (e.old_string?.split("\n").length ?? 0), 0);
      return (
        <>
          {verb(`Edit ${edits.length > 1 ? `${edits.length} changes` : "1 change"}`)}
          <FilePill path={fp} />
          <DiffStats added={totalAdded} removed={totalRemoved} />
        </>
      );
    }
    case "agent": {
      const desc = String(input.description ?? input.prompt ?? "").slice(0, 80);
      return (
        <>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: "var(--accent)", flexShrink: 0 }}>
            <rect x="2" y="1" width="8" height="7" rx="1.5" />
            <path d="M4 4h4M4 6h2" strokeLinecap="round" />
            <path d="M4 8v2M8 8v2M3 10h6" strokeLinecap="round" />
          </svg>
          {verb("Agent")}
          {desc && <span style={{ color: "var(--text-muted)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{desc}</span>}
        </>
      );
    }
    default:
      return dim(name);
  }
}
