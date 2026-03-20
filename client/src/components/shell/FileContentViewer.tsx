import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FileCode, Copy, Terminal, ClipboardCopy, FolderOpen } from "lucide-react";
import { highlightCode, getLanguageFromPath } from "../../lib/highlight";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";

function useThemeMode(): "dark" | "light" {
  const [mode, setMode] = useState<"dark" | "light">(
    () => (document.documentElement.getAttribute("data-theme") as "dark" | "light") || "dark"
  );
  useEffect(() => {
    const handler = (e: Event) => {
      setMode((e as CustomEvent<string>).detail === "light" ? "light" : "dark");
    };
    window.addEventListener("studio:theme-change", handler);
    return () => window.removeEventListener("studio:theme-change", handler);
  }, []);
  return mode;
}

function restoreSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export default function FileContentViewer() {
  const themeMode = useThemeMode();
  const scrollRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [showLineNums, setShowLineNums] = useState<boolean>(() => restoreSetting("line_nums", true));

  // Listen for line_nums setting changes from Settings page
  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value } = (e as CustomEvent<{ key: string; value: unknown }>).detail;
      if (key === "line_nums" && typeof value === "boolean") {
        setShowLineNums(value);
      }
    };
    window.addEventListener("studio:settings-change", handler);
    return () => window.removeEventListener("studio:settings-change", handler);
  }, []);

  const handleContentContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!filePath) return [];

    const dirPath = filePath.includes("/")
      ? filePath.substring(0, filePath.lastIndexOf("/"))
      : filePath;

    // Derive relative path: strip leading slash or common prefix
    const relativePath = filePath.startsWith("/")
      ? filePath.replace(/^\//, "")
      : filePath;

    return [
      {
        label: "Copy Selection",
        icon: <Copy size={12} />,
        onClick: () => {
          const selection = document.getSelection();
          if (selection && selection.toString()) {
            navigator.clipboard.writeText(selection.toString()).catch(() => {});
          }
        },
      },
      {
        label: "Find All Occurrences",
        onClick: () => {
          const sel = document.getSelection()?.toString();
          if (sel) {
            window.dispatchEvent(new CustomEvent("studio:navigate", { detail: "/search" }));
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("studio:search-query", { detail: sel }));
            }, 100);
          }
        },
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Add File to Chat",
        onClick: () => {
          window.dispatchEvent(new CustomEvent("studio:suggest", {
            detail: { text: `@${relativePath} ` },
          }));
        },
      },
      {
        label: "Open in Terminal",
        icon: <Terminal size={12} />,
        onClick: () => {
          window.dispatchEvent(new CustomEvent("studio:terminal-paste", {
            detail: `cd ${dirPath}\n`,
          }));
        },
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Copy File Path",
        icon: <ClipboardCopy size={12} />,
        onClick: () => {
          navigator.clipboard.writeText(filePath).catch(() => {});
        },
      },
      {
        label: "Copy Relative Path",
        icon: <FolderOpen size={12} />,
        onClick: () => {
          navigator.clipboard.writeText(relativePath).catch(() => {});
        },
      },
    ];
  }, [filePath]);

  // Listen for file open events from FileTreeSidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string | { path: string }>).detail;
      const path = typeof detail === "string" ? detail : detail?.path;
      if (path) {
        setFilePath(path);
        setLoading(true);
        setError(null);
        setHighlightedHtml("");
        fetch(`/api/files/read?path=${encodeURIComponent(path)}`)
          .then((r) => {
            if (!r.ok) throw new Error("Failed to load file");
            return r.json();
          })
          .then((d: { content?: string }) => {
            setContent(d.content ?? "");
            setLoading(false);
            // Track in recent files
            try {
              const key = "studio:recent_files";
              const recent = JSON.parse(
                localStorage.getItem(key) || "[]",
              ) as string[];
              const updated = [path, ...recent.filter((f) => f !== path)].slice(
                0,
                10,
              );
              localStorage.setItem(key, JSON.stringify(updated));
            } catch {
              /* localStorage may be unavailable */
            }
          })
          .catch((err) => {
            setError(
              err instanceof Error ? err.message : "Failed to load",
            );
            setLoading(false);
          });
      }
    };
    window.addEventListener("studio:open-file", handler);
    return () => window.removeEventListener("studio:open-file", handler);
  }, []);

  // Highlight content when it changes
  useEffect(() => {
    if (!content || !filePath) return;
    let cancelled = false;
    const lang = getLanguageFromPath(filePath);
    highlightCode(content, lang, themeMode)
      .then((html) => {
        if (!cancelled) setHighlightedHtml(html || "");
      })
      .catch((err) => {
        console.warn("[shiki] highlight failed:", err);
        if (!cancelled) setHighlightedHtml("");
      });
    return () => {
      cancelled = true;
    };
  }, [content, filePath, themeMode]);

  // Minimap scroll sync
  useEffect(() => {
    const el = scrollRef.current;
    const mm = minimapRef.current;
    if (!el || !mm) return;
    const onScroll = () => {
      const ratio = el.scrollTop / (el.scrollHeight - el.clientHeight || 1);
      mm.scrollTop = ratio * (mm.scrollHeight - mm.clientHeight || 1);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [highlightedHtml]);

  if (!filePath) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dimmer)",
          fontSize: 13,
          fontFamily: "var(--font-ui)",
        }}
      >
        Select a file to view its contents.
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* File path breadcrumb */}
      <div
        style={{
          height: 32,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px",
          borderBottom: "1px solid var(--border-dim)",
          fontSize: 12,
          fontFamily: "var(--font)",
          color: "var(--text-dim)",
        }}
      >
        <FileCode size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
        {filePath.split("/").filter(Boolean).map((seg, i, arr) => {
          const isLast = i === arr.length - 1;
          const dirPath = arr.slice(0, i + 1).join("/");
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {i > 0 && <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>{">"}</span>}
              <span
                onClick={() => {
                  if (!isLast) {
                    window.dispatchEvent(new CustomEvent("studio:open-dir", { detail: dirPath }));
                  }
                }}
                style={{
                  cursor: isLast ? "default" : "pointer",
                  color: isLast ? "var(--text)" : "var(--text-dim)",
                  fontWeight: isLast ? 500 : 400,
                }}
                onMouseEnter={e => { if (!isLast) e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={e => { if (!isLast) e.currentTarget.style.color = "var(--text-dim)"; }}
              >
                {seg}
              </span>
            </span>
          );
        })}
      </div>

      {/* Content + Minimap */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div
        ref={scrollRef}
        onContextMenu={handleContentContextMenu}
        style={{ flex: 1, overflow: "auto", padding: "8px 0" }}
      >
        {loading ? (
          <div
            style={{
              padding: "20px 16px",
              color: "var(--text-dimmer)",
              fontSize: 12,
            }}
          >
            Loading...
          </div>
        ) : error ? (
          <div
            style={{
              padding: "20px 16px",
              color: "var(--red)",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        ) : highlightedHtml ? (
          <div
            className={`shiki-viewer${showLineNums ? "" : " hide-line-nums"}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            style={{
              fontSize: 13,
              fontFamily: "var(--font)",
              lineHeight: 1.5,
              padding: "0 16px",
            }}
          />
        ) : (
          <pre
            style={{
              margin: 0,
              padding: "0 16px",
              fontSize: 13,
              fontFamily: "var(--font)",
              color: "var(--text)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content.split("\n").map((line, i) => (
              <div key={i} style={{ display: "flex", minHeight: 20 }}>
                {showLineNums && (
                  <span
                    style={{
                      width: 48,
                      flexShrink: 0,
                      textAlign: "right",
                      paddingRight: 12,
                      color: "var(--text-dimmer)",
                      userSelect: "none",
                      fontSize: 12,
                    }}
                  >
                    {i + 1}
                  </span>
                )}
                <span>{line || " "}</span>
              </div>
            ))}
          </pre>
        )}
      </div>

      {/* Minimap */}
      {highlightedHtml && content.split("\n").length > 40 && (
        <div
          ref={minimapRef}
          style={{
            width: 80,
            flexShrink: 0,
            overflow: "hidden",
            borderLeft: "1px solid var(--border-dim)",
            opacity: 0.6,
            cursor: "default",
            userSelect: "none",
          }}
        >
          <div
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            style={{
              transform: "scale(0.15)",
              transformOrigin: "top left",
              width: "666%",
              fontSize: 13,
              fontFamily: "var(--font)",
              lineHeight: 1.5,
              pointerEvents: "none",
            }}
          />
        </div>
      )}
      </div>

      <ContextMenu
        items={ctxMenuItems}
        position={ctxMenu}
        onClose={() => setCtxMenu(null)}
      />
    </div>
  );
}
