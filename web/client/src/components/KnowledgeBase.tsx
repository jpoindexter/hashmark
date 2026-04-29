import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "./Toasts";

interface KBPage {
  id: string;
  title: string;
  content: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

const STORAGE_KEY = "hm-kb-pages";

function loadPages(): KBPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as KBPage[];
  } catch { /* ignore */ }
  return [];
}

function savePages(pages: KBPage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// Minimal markdown renderer — no external deps
function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.slice(3, -3).replace(/^\w+\n/, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return `<pre style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:4px;padding:10px 12px;overflow-x:auto;font-size:11.5px;line-height:1.5"><code>${inner.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-elevated);padding:1px 5px;border-radius:3px;font-size:11.5px">$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:16px 0 6px;color:var(--text)">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:15px;font-weight:600;margin:20px 0 8px;color:var(--text)">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:18px;font-weight:700;margin:24px 0 10px;color:var(--text)">$1</h1>');

  // Blockquote
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent);margin:8px 0;padding:4px 12px;color:var(--text-dim)">$1</blockquote>');

  // Bold / italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin:2px 0;padding-left:4px">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul style="margin:8px 0;padding-left:20px;list-style:disc">${m}</ul>`);

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--accent)" target="_blank" rel="noopener">$1</a>');

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p style="margin:10px 0">');
  html = `<p style="margin:10px 0">${html}</p>`;

  return html;
}

function insertAtCursor(el: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end) || placeholder;
  const newVal = el.value.slice(0, start) + before + selected + after + el.value.slice(end);
  el.focus();
  // Use execCommand for undo history if available, otherwise direct value set
  document.execCommand("insertText", false, before + selected + after);
  if (el.value !== newVal) {
    el.value = newVal;
  }
  el.selectionStart = start + before.length;
  el.selectionEnd = start + before.length + selected.length;
}

interface PageTreeItemProps {
  page: KBPage;
  pages: KBPage[];
  depth: number;
  selectedId: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

function PageTreeItem({ page, pages, depth, selectedId, collapsed, onSelect, onToggleCollapse }: PageTreeItemProps) {
  const children = pages.filter(p => p.parentId === page.id);
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(page.id);
  const isSelected = selectedId === page.id;

  return (
    <>
      <div
        onClick={() => onSelect(page.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          paddingLeft: 8 + depth * 14,
          cursor: "pointer",
          borderRadius: 4,
          fontSize: 12,
          color: isSelected ? "var(--text)" : "var(--text-dim)",
          background: isSelected ? "var(--bg-elevated)" : "transparent",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        {hasChildren ? (
          <span
            onClick={e => { e.stopPropagation(); onToggleCollapse(page.id); }}
            style={{ fontSize: 9, color: "var(--text-muted)", width: 10, flexShrink: 0, cursor: "pointer" }}
          >
            {isCollapsed ? "▶" : "▼"}
          </span>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {page.title || "Untitled"}
        </span>
      </div>
      {hasChildren && !isCollapsed && children.map(child => (
        <PageTreeItem
          key={child.id}
          page={child}
          pages={pages}
          depth={depth + 1}
          selectedId={selectedId}
          collapsed={collapsed}
          onSelect={onSelect}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </>
  );
}

export function KnowledgeBase() {
  const [pages, setPages] = useState<KBPage[]>(loadPages);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadPages()[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedPage = pages.find(p => p.id === selectedId) ?? null;

  const persist = useCallback((updated: KBPage[]) => {
    setPages(updated);
    savePages(updated);
  }, []);

  const updatePage = useCallback((id: string, patch: Partial<KBPage>) => {
    setPages(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p);
      savePages(next);
      return next;
    });
  }, []);

  const newPage = () => {
    const page: KBPage = {
      id: genId(),
      title: "",
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };
    persist([page, ...pages]);
    setSelectedId(page.id);
    setTimeout(() => titleRef.current?.focus(), 50);
  };

  const deletePage = (id: string) => {
    const next = pages.filter(p => p.id !== id && p.parentId !== id);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
    setConfirmDeleteId(null);
    toast.success("Page deleted");
  };

  // Ctrl+S save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (selectedId) {
          toast.success("Saved");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  const filteredRoots = pages.filter(p => {
    if (p.parentId) return false;
    if (search) return p.title.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const filteredSearch = search
    ? pages.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
    : null;

  const toolbar: Array<{ label: string; before: string; after: string; placeholder: string }> = [
    { label: "B", before: "**", after: "**", placeholder: "bold" },
    { label: "I", before: "*", after: "*", placeholder: "italic" },
    { label: "Code", before: "`", after: "`", placeholder: "code" },
    { label: "Link", before: "[", after: "](url)", placeholder: "text" },
    { label: "H1", before: "# ", after: "", placeholder: "Heading" },
    { label: "H2", before: "## ", after: "", placeholder: "Heading" },
    { label: "H3", before: "### ", after: "", placeholder: "Heading" },
    { label: "•", before: "- ", after: "", placeholder: "item" },
    { label: "\"", before: "> ", after: "", placeholder: "quote" },
  ];

  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim() && selectedPage) {
      e.preventDefault();
      const tag = tagInput.trim().replace(/,$/, "");
      if (tag && !selectedPage.tags.includes(tag)) {
        updatePage(selectedPage.id, { tags: [...selectedPage.tags, tag] });
      }
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    if (selectedPage) {
      updatePage(selectedPage.id, { tags: selectedPage.tags.filter(t => t !== tag) });
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Left: tree nav */}
      <div style={{
        width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
        borderRight: "1px solid var(--border)", background: "var(--bg-panel)",
      }}>
        <div style={{ padding: "8px 8px 4px", flexShrink: 0 }}>
          <button
            onClick={newPage}
            style={{
              width: "100%", padding: "5px 10px", background: "var(--bg-elevated)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              cursor: "pointer", fontSize: 11, color: "var(--text-dim)",
              display: "flex", alignItems: "center", gap: 6,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New Page
          </button>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pages..."
            style={{
              marginTop: 6, width: "100%", padding: "4px 8px", background: "var(--bg-input)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              fontSize: 11, color: "var(--text)", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 4px" }}>
          {(filteredSearch ?? filteredRoots).map(page => (
            filteredSearch ? (
              <div
                key={page.id}
                onClick={() => { setSelectedId(page.id); setSearch(""); }}
                style={{
                  padding: "4px 8px", cursor: "pointer", borderRadius: 4, fontSize: 12,
                  color: selectedId === page.id ? "var(--text)" : "var(--text-dim)",
                  background: selectedId === page.id ? "var(--bg-elevated)" : "transparent",
                }}
                onMouseEnter={e => { if (selectedId !== page.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (selectedId !== page.id) e.currentTarget.style.background = "transparent"; }}
              >
                {page.title || "Untitled"}
              </div>
            ) : (
              <PageTreeItem
                key={page.id}
                page={page}
                pages={pages}
                depth={0}
                selectedId={selectedId}
                collapsed={collapsed}
                onSelect={setSelectedId}
                onToggleCollapse={id => setCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
              />
            )
          ))}
          {pages.length === 0 && (
            <div style={{ padding: "20px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              No pages yet
            </div>
          )}
        </div>
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
        {selectedPage ? (
          <>
            {/* Title */}
            <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
              <input
                ref={titleRef}
                value={selectedPage.title}
                onChange={e => updatePage(selectedPage.id, { title: e.target.value })}
                placeholder="Untitled"
                style={{
                  width: "100%", background: "none", border: "none", outline: "none",
                  fontSize: 20, fontWeight: 700, color: "var(--text)",
                  fontFamily: "var(--font-sans)", boxSizing: "border-box",
                }}
              />

              {/* Tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8, alignItems: "center" }}>
                {selectedPage.tags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 7px",
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      borderRadius: 999, fontSize: 10, color: "var(--text-dim)",
                    }}
                  >
                    {tag}
                    <span
                      onClick={() => removeTag(tag)}
                      style={{ cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, fontSize: 12 }}
                    >×</span>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={addTag}
                  placeholder="+ tag"
                  style={{
                    background: "none", border: "none", outline: "none", fontSize: 10,
                    color: "var(--text-muted)", width: 50, fontFamily: "var(--font-sans)",
                  }}
                />
              </div>
            </div>

            {/* Toolbar */}
            <div style={{
              display: "flex", gap: 2, padding: "8px 20px 6px", flexShrink: 0,
              borderBottom: "1px solid var(--border)", flexWrap: "wrap",
            }}>
              {toolbar.map(item => (
                <button
                  key={item.label}
                  onMouseDown={e => {
                    e.preventDefault();
                    if (textareaRef.current) insertAtCursor(textareaRef.current, item.before, item.after, item.placeholder);
                    const el = textareaRef.current;
                    if (el) {
                      const val = el.value;
                      updatePage(selectedPage.id, { content: val });
                    }
                  }}
                  style={{
                    padding: "2px 7px", background: "none", border: "1px solid var(--border)",
                    borderRadius: 3, cursor: "pointer", fontSize: 11, color: "var(--text-dim)",
                    fontFamily: item.label === "B" ? "serif" : "var(--font-sans)",
                    fontWeight: item.label === "B" ? 700 : 400,
                    fontStyle: item.label === "I" ? "italic" : "normal",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  {item.label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setShowPreview(v => !v)}
                style={{
                  padding: "2px 10px", background: showPreview ? "var(--bg-elevated)" : "none",
                  border: "1px solid var(--border)", borderRadius: 3, cursor: "pointer",
                  fontSize: 11, color: showPreview ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>

            {/* Editor / Preview */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
              {showPreview ? (
                <div
                  style={{
                    flex: 1, overflowY: "auto", padding: "16px 20px",
                    fontSize: 13, lineHeight: 1.7, color: "var(--text-dim)",
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedPage.content) }}
                />
              ) : (
                <textarea
                  ref={textareaRef}
                  value={selectedPage.content}
                  onChange={e => updatePage(selectedPage.id, { content: e.target.value })}
                  placeholder="Start writing..."
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none", resize: "none",
                    fontSize: 12.5, color: "var(--text)", fontFamily: "var(--font-mono)",
                    lineHeight: 1.7, padding: "14px 20px", minHeight: 0,
                  }}
                />
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "6px 20px", borderTop: "1px solid var(--border)", flexShrink: 0,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                Updated {new Date(selectedPage.updatedAt).toLocaleDateString()}
              </span>
              <div style={{ flex: 1 }} />
              {confirmDeleteId === selectedPage.id ? (
                <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
                  Delete?
                  <button
                    onClick={() => deletePage(selectedPage.id)}
                    style={{ padding: "2px 8px", background: "var(--error, #ef4444)", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11, color: "#fff" }}
                  >Yes</button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    style={{ padding: "2px 8px", background: "none", border: "1px solid var(--border)", borderRadius: 3, cursor: "pointer", fontSize: 11, color: "var(--text-dim)" }}
                  >No</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(selectedPage.id)}
                  title="Delete page"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, padding: "2px 4px" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  🗑
                </button>
              )}
              <button
                onClick={() => { toast.success("Saved"); }}
                style={{
                  padding: "4px 14px", background: "var(--accent)", border: "none",
                  borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 11,
                  color: "#fff", fontFamily: "var(--font-sans)",
                }}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 28, opacity: 0.25 }}>📄</div>
            <div style={{ fontSize: 12 }}>Select a page or create a new one</div>
            <button
              onClick={newPage}
              style={{ padding: "6px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, color: "var(--text-dim)" }}
            >
              + New Page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
