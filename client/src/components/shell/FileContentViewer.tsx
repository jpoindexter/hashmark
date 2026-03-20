import { useState, useEffect, useCallback, useRef } from "react";
import { FileCode } from "lucide-react";
import type * as MonacoTypes from "monaco-editor";

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
};

function getMonacoLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

function restoreSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function FileContentViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoTypes | null>(null);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [monacoLoading, setMonacoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getThemeName = useCallback((): string => {
    const mode = document.documentElement.getAttribute("data-theme") || "dark";
    return mode === "light" ? "vs" : "vs-dark";
  }, []);

  // Dynamically load Monaco and create editor on first file open
  useEffect(() => {
    if (!containerRef.current || !filePath) return;
    if (editorRef.current) return; // already created

    let cancelled = false;
    setMonacoLoading(true);

    (async () => {
      await import("../../lib/monaco-setup");
      const monaco = await import("monaco-editor");
      if (cancelled) return;

      monacoRef.current = monaco;

      // Define custom themes matching our app colors
      monaco.editor.defineTheme("hashmark-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": "#0d1117",
          "editor.foreground": "#e6edf3",
          "editorLineNumber.foreground": "#484f58",
          "editorLineNumber.activeForeground": "#e6edf3",
          "editor.selectionBackground": "#264f78",
          "editor.lineHighlightBackground": "#161b22",
          "editorIndentGuide.background1": "#21262d",
          "editorIndentGuide.activeBackground1": "#30363d",
          "minimap.background": "#0d1117",
          "editorGutter.background": "#0d1117",
          "scrollbarSlider.background": "rgba(110,118,129,0.3)",
          "scrollbarSlider.hoverBackground": "rgba(110,118,129,0.5)",
        },
      });
      monaco.editor.defineTheme("hashmark-light", {
        base: "vs",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": "#ffffff",
          "editor.foreground": "#1f2328",
          "editorLineNumber.foreground": "#8c959f",
          "editor.selectionBackground": "#add6ff",
          "editor.lineHighlightBackground": "#f6f8fa",
          "editorIndentGuide.background1": "#d0d7de",
          "minimap.background": "#ffffff",
          "editorGutter.background": "#ffffff",
        },
      });

      const fontSize = restoreSetting<number>("font_size", 13);
      const themeName = getThemeName() === "light" ? "hashmark-light" : "hashmark-dark";

      const editor = monaco.editor.create(containerRef.current!, {
        value: "",
        language: "plaintext",
        theme: themeName,
        readOnly: true,
        minimap: { enabled: true },
        lineNumbers: "on",
        guides: { indentation: true },
        fontSize,
        fontFamily: "var(--font)",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderLineHighlight: "none",
        domReadOnly: true,
        contextmenu: true,
        smoothScrolling: true,
        padding: { top: 8, bottom: 8 },
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
      });

      editorRef.current = editor;
      setMonacoLoading(false);
    })();

    return () => {
      cancelled = true;
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, [filePath, getThemeName]);

  // Theme sync
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      monacoRef.current?.editor.setTheme(detail === "light" ? "hashmark-light" : "hashmark-dark");
    };
    window.addEventListener("studio:theme-change", handler);
    return () => window.removeEventListener("studio:theme-change", handler);
  }, []);

  // Font size sync
  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value } = (e as CustomEvent<{ key: string; value: unknown }>).detail;
      if (key === "font_size" && typeof value === "number" && editorRef.current) {
        editorRef.current.updateOptions({ fontSize: value });
      }
    };
    window.addEventListener("studio:settings-change", handler);
    return () => window.removeEventListener("studio:settings-change", handler);
  }, []);

  // Listen for file open events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string | { path: string }>).detail;
      const path = typeof detail === "string" ? detail : detail?.path;
      if (path) {
        setFilePath(path);
        setLoading(true);
        setError(null);
        fetch(`/api/files/read?path=${encodeURIComponent(path)}`)
          .then((r) => {
            if (!r.ok) throw new Error("Failed to load file");
            return r.json();
          })
          .then((d: { content?: string }) => {
            setContent(d.content ?? "");
            setLoading(false);
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

  // Push content + language into editor when they change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !filePath) return;

    const lang = getMonacoLanguage(filePath);
    const model = editor.getModel();

    if (model) {
      monaco.editor.setModelLanguage(model, lang);
      model.setValue(content);
    }

    editor.revealLine(1);
  }, [content, filePath]);

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
        {filePath
          .split("/")
          .filter(Boolean)
          .map((seg, i, arr) => {
            const isLast = i === arr.length - 1;
            const dirPath = arr.slice(0, i + 1).join("/");
            return (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                {i > 0 && (
                  <span
                    style={{ color: "var(--text-dimmer)", fontSize: 10 }}
                  >
                    {">"}
                  </span>
                )}
                <span
                  onClick={() => {
                    if (!isLast) {
                      window.dispatchEvent(
                        new CustomEvent("studio:open-dir", {
                          detail: dirPath,
                        }),
                      );
                    }
                  }}
                  style={{
                    cursor: isLast ? "default" : "pointer",
                    color: isLast ? "var(--text)" : "var(--text-dim)",
                    fontWeight: isLast ? 500 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!isLast)
                      e.currentTarget.style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isLast)
                      e.currentTarget.style.color = "var(--text-dim)";
                  }}
                >
                  {seg}
                </span>
              </span>
            );
          })}
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {(loading || monacoLoading) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dimmer)",
              fontSize: 12,
              zIndex: 10,
              background: "var(--bg)",
            }}
          >
            {monacoLoading ? "Loading editor..." : "Loading..."}
          </div>
        )}
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--red)",
              fontSize: 12,
              zIndex: 10,
              background: "var(--bg)",
            }}
          >
            {error}
          </div>
        )}
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            visibility: loading || monacoLoading || error ? "hidden" : "visible",
          }}
        />
      </div>
    </div>
  );
}
