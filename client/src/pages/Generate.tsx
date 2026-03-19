import { useState, useEffect, useCallback, useRef } from "react";
import ScanProgress, { type ScanResult, type ScanDelta } from "../components/ScanProgress.tsx";
import { toast } from "../hooks/useToast.ts";

const ALL_FORMATS = [
  { id: "CLAUDE.md",            label: "CLAUDE.md",            hint: "Anthropic Claude" },
  { id: "AGENTS.md",            label: "AGENTS.md",            hint: "OpenAI Agents" },
  { id: ".cursorrules",         label: ".cursorrules",         hint: "Cursor" },
  { id: ".windsurfrules",       label: ".windsurfrules",       hint: "Windsurf" },
  { id: "openai-system-prompt", label: "openai-system-prompt", hint: "ChatGPT / API" },
  { id: "json",                 label: "JSON",                 hint: "Raw output" },
];

interface ProjectInfo {
  projectName: string;
  projectDir: string;
  configured: boolean;
}

interface StalenessInfo {
  exists: boolean;
  generatedAt: string | null;
  commitsSince: number | null;
  daysStale: number | null;
}

interface ScanHistory {
  snapshots: Array<{
    scannedAt: number;
    totalFiles: number;
    totalLines: number;
    componentCount: number;
    apiRouteCount: number;
    aiReadiness: number | null;
    hubFileCount: number;
  }>;
}

interface ScanConfig {
  formats: string[];
  maxTokens: number;
  watchDebounceMs: number;
  autoRescan: boolean;
}

interface GeneratedFileInfo {
  name: string;
  tokens?: number;
  bytes?: number;
  path?: string;
}

type PageState = "idle" | "scanning" | "done" | "error";

function freshnessLabel(info: StalenessInfo): { text: string; cls: string } {
  if (!info.exists) return { text: "No CLAUDE.md", cls: "badge-zinc" };
  if (info.commitsSince === null) return { text: "Unknown freshness", cls: "badge-zinc" };
  if (info.commitsSince === 0) return { text: "Fresh", cls: "badge-green" };
  if (info.commitsSince < 5) return { text: `${info.commitsSince} commits stale`, cls: "badge-yellow" };
  return { text: `${info.commitsSince} commits stale`, cls: "badge-red" };
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tokens`;
  return `${n} tokens`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Generate() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [staleness, setStaleness] = useState<StalenessInfo | null>(null);
  const [history, setHistory] = useState<ScanHistory | null>(null);
  const [config, setConfig] = useState<ScanConfig | null>(null);

  // Format selection — seeded from config once loaded
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    new Set(["CLAUDE.md", "AGENTS.md", ".cursorrules"])
  );

  // Scan options
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [rescanChanged, setRescanChanged] = useState(false);
  const [maxTokens, setMaxTokens] = useState("");
  const [includeTests, setIncludeTests] = useState(false);
  const [customRules, setCustomRules] = useState("");

  // Post-scan output
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanDelta, setScanDelta] = useState<ScanDelta | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load all initial data in parallel
  useEffect(() => {
    void Promise.all([
      fetch("/api/info").then(r => r.json() as Promise<ProjectInfo>).then(setInfo).catch(() => {}),
      fetch("/api/scan/staleness").then(r => r.json() as Promise<StalenessInfo>).then(setStaleness).catch(() => {}),
      fetch("/api/scan/history").then(r => r.json() as Promise<ScanHistory>).then(setHistory).catch(() => {}),
      fetch("/api/config").then(r => r.json() as Promise<ScanConfig>).then(cfg => {
        setConfig(cfg);
        if (cfg.formats?.length) setSelectedFormats(new Set(cfg.formats));
        if (cfg.maxTokens && cfg.maxTokens !== 100000) setMaxTokens(String(cfg.maxTokens));
      }).catch(() => {}),
    ]);
  }, []);

  // Cmd+Enter to trigger scan
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && pageState === "idle") {
        e.preventDefault();
        triggerScan();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pageState, selectedFormats, rescanChanged, maxTokens, includeTests, customRules]);

  function toggleFormat(id: string) {
    setSelectedFormats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedFormats(new Set(ALL_FORMATS.map(f => f.id))); }
  function clearAll()  { setSelectedFormats(new Set()); }

  function triggerScan() {
    if (selectedFormats.size === 0) return;
    setPageState("scanning");
    setScanResult(null);
    setScanDelta(null);
    setErrorMsg("");
  }

  const handleScanComplete = useCallback((result: ScanResult, delta: ScanDelta | null) => {
    setScanResult(result);
    setScanDelta(delta);
    setPageState("done");
    // Re-fetch freshness + history
    void fetch("/api/scan/staleness").then(r => r.json() as Promise<StalenessInfo>).then(setStaleness).catch(() => {});
    void fetch("/api/scan/history").then(r => r.json() as Promise<ScanHistory>).then(setHistory).catch(() => {});

    const generated = result.generatedFiles as Array<{ fileName?: string; tokenCount?: number }> | undefined;
    const totalTokens = Array.isArray(generated)
      ? generated.reduce((sum, f) => sum + (f.tokenCount ?? 0), 0)
      : 0;
    const fileCount = Array.isArray(generated) ? generated.length : 0;
    const desc = totalTokens > 0
      ? `${(totalTokens / 1000).toFixed(1)}k tokens • ${fileCount} file${fileCount !== 1 ? "s" : ""}`
      : `${fileCount} file${fileCount !== 1 ? "s" : ""} generated`;
    toast("Context generated", { variant: "success", title: desc });
  }, []);

  const handleScanError = useCallback((err: string) => {
    setErrorMsg(err);
    setPageState("error");
    toast("Scan failed", { variant: "error", title: err });
  }, []);

  const handleScanCancel = useCallback(() => {
    setPageState("idle");
  }, []);

  async function copyFile(name: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(name);
      setTimeout(() => setCopiedFile(null), 2000);
      toast("Copied to clipboard", { variant: "info" });
    } catch {}
  }

  // Extract generated files from scan result
  function getGeneratedFiles(): GeneratedFileInfo[] {
    if (!scanResult) return [];
    const files: GeneratedFileInfo[] = [];
    const generated = scanResult.generatedFiles as Array<{ fileName?: string; tokenCount?: number; content?: string }> | undefined;
    if (Array.isArray(generated)) {
      for (const gf of generated) {
        files.push({
          name: gf.fileName ?? "unknown",
          tokens: gf.tokenCount,
          bytes: gf.content ? new TextEncoder().encode(gf.content).length : undefined,
        });
      }
    }
    // Fallback: infer from selected formats if no generatedFiles field
    if (files.length === 0 && pageState === "done") {
      for (const fmt of selectedFormats) {
        files.push({ name: fmt });
      }
    }
    return files;
  }

  const freshness = staleness ? freshnessLabel(staleness) : null;
  const lastSnap = history?.snapshots?.[0];
  const void_ = config; // suppress unused warning

  return (
    <div ref={containerRef} style={{ padding: "28px", maxWidth: "860px" }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "4px" }}>
              {info?.projectName ?? "Generate Context"}
            </h1>
            {info?.projectDir && (
              <div style={{ fontSize: "11px", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                {info.projectDir}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {freshness && (
              <span className={`badge ${freshness.cls === "badge-red"
                ? ""
                : freshness.cls}`}
                style={freshness.cls === "badge-red" ? {
                  display: "inline-flex", alignItems: "center",
                  padding: "1px 7px", borderRadius: "100px",
                  fontSize: "11px", fontWeight: 500,
                  background: "rgba(248,81,73,.1)", color: "var(--red)",
                  border: "1px solid rgba(248,81,73,.25)",
                } : undefined}
              >
                {freshness.text}
              </span>
            )}
            {lastSnap && (
              <>
                <span style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
                  {lastSnap.totalLines.toLocaleString()} lines
                </span>
                <span style={{ color: "var(--border)", fontSize: "11px" }}>·</span>
                <span style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
                  last scanned {fmtTime(lastSnap.scannedAt)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Scanning state ─────────────────────────────────── */}
      {pageState === "scanning" && (
        <div style={{ marginBottom: "24px" }}>
          <ScanProgress
            onComplete={handleScanComplete}
            onError={handleScanError}
            onCancel={handleScanCancel}
          />
        </div>
      )}

      {/* ── Idle / Done / Error form area ──────────────────── */}
      {pageState !== "scanning" && (
        <div className="fade-in">

          {/* Format selector */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "10px",
            }}>
              <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dimmer)", fontWeight: 600 }}>
                Formats
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn btn-sm"
                  onClick={selectAll}
                >
                  Select all
                </button>
                <button
                  className="btn btn-sm"
                  onClick={clearAll}
                >
                  Clear
                </button>
              </div>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "8px",
            }}>
              {ALL_FORMATS.map(fmt => {
                const checked = selectedFormats.has(fmt.id);
                return (
                  <div
                    key={fmt.id}
                    onClick={() => toggleFormat(fmt.id)}
                    style={{
                      padding: "10px 12px",
                      border: "1px solid",
                      borderColor: checked ? "var(--accent)" : "var(--border-dim)",
                      borderRadius: "var(--radius)",
                      background: checked ? "var(--accent-bg)" : "var(--bg-2)",
                      cursor: "pointer",
                      transition: "all 0.1s",
                      userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <div style={{
                        width: "13px", height: "13px",
                        border: "1px solid",
                        borderColor: checked ? "var(--accent)" : "var(--border)",
                        borderRadius: "3px",
                        background: checked ? "var(--accent)" : "transparent",
                        flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {checked && (
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path d="M1 3L3 5L7 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: checked ? "var(--accent)" : "var(--text)", fontFamily: "var(--font)" }}>
                          {fmt.label}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>
                          {fmt.hint}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scan options — collapsible */}
          <div style={{ marginBottom: "20px" }}>
            <button
              className="btn btn-sm"
              onClick={() => setOptionsOpen(o => !o)}
              style={{ gap: "6px" }}
            >
              <span style={{ color: "var(--text-dimmer)", fontSize: "10px" }}>{optionsOpen ? "▾" : "▸"}</span>
              Scan options
            </button>

            {optionsOpen && (
              <div className="fade-in" style={{
                marginTop: "10px",
                padding: "16px",
                background: "var(--bg-2)",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--radius)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}>

                {/* --rescan-only-changed */}
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={rescanChanged}
                    onChange={e => setRescanChanged(e.target.checked)}
                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)" }}
                  />
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)" }}>--rescan-only-changed</div>
                    <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>Only re-process files changed since last scan</div>
                  </div>
                </label>

                {/* --include-tests */}
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={includeTests}
                    onChange={e => setIncludeTests(e.target.checked)}
                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)" }}
                  />
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)" }}>--include-tests</div>
                    <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>Include test files in analysis</div>
                  </div>
                </label>

                {/* --max-tokens */}
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)", marginBottom: "6px" }}>
                    --max-tokens
                  </div>
                  <input
                    type="number"
                    placeholder="e.g. 80000  (empty = no limit)"
                    value={maxTokens}
                    onChange={e => setMaxTokens(e.target.value)}
                    style={{ width: "240px" }}
                    min={1000}
                  />
                  <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "4px" }}>
                    Limit output token count per format
                  </div>
                </div>

                {/* Custom rules */}
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)", marginBottom: "6px" }}>
                    Custom rules
                  </div>
                  <textarea
                    value={customRules}
                    onChange={e => setCustomRules(e.target.value)}
                    placeholder={"One rule per line:\nAlways use TypeScript strict mode\nPrefer functional components"}
                    rows={4}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "4px" }}>
                    Appended to the generated context as project-specific rules
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Generate button */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <button
              className="btn btn-primary"
              onClick={triggerScan}
              disabled={selectedFormats.size === 0}
            >
              Generate Context
            </button>
            <span style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>
              {selectedFormats.size === 0
                ? "Select at least one format"
                : `${selectedFormats.size} format${selectedFormats.size !== 1 ? "s" : ""}  ·  ⌘↵`}
            </span>
          </div>

          {/* Error */}
          {pageState === "error" && errorMsg && (
            <div style={{
              padding: "12px 14px",
              background: "var(--red-bg)",
              border: "1px solid rgba(248,81,73,.25)",
              borderRadius: "var(--radius)",
              fontSize: "12px",
              color: "var(--red)",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>{errorMsg}</span>
              <button className="btn btn-sm" onClick={() => setPageState("idle")}>
                Dismiss
              </button>
            </div>
          )}

          {/* Post-scan output */}
          {pageState === "done" && scanResult && (
            <div className="fade-in">

              {/* Delta summary */}
              {scanDelta && Object.keys(scanDelta).length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{
                    fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em",
                    color: "var(--text-dimmer)", marginBottom: "8px", fontWeight: 600,
                  }}>
                    What changed
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {Object.entries(scanDelta).map(([key, val]) => {
                      const isPositive = val.delta > 0;
                      const isZero = val.delta === 0;
                      return (
                        <div key={key} style={{
                          padding: "6px 10px",
                          background: "var(--bg-2)",
                          border: "1px solid var(--border-dim)",
                          borderRadius: "var(--radius)",
                          fontSize: "11px",
                        }}>
                          <span style={{ color: "var(--text-dim)" }}>{key}: </span>
                          <span style={{ color: "var(--text)", fontFamily: "var(--font)" }}>{val.curr.toLocaleString()}</span>
                          {!isZero && (
                            <span style={{
                              marginLeft: "5px",
                              color: isPositive ? "var(--accent)" : "var(--red)",
                              fontSize: "10px",
                            }}>
                              {isPositive ? "+" : ""}{val.delta} ({val.pct > 0 ? "+" : ""}{val.pct}%)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Generated files */}
              {(() => {
                const files = getGeneratedFiles();
                return files.length > 0 ? (
                  <div>
                    <div style={{
                      fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em",
                      color: "var(--text-dimmer)", marginBottom: "8px", fontWeight: 600,
                    }}>
                      Output files
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {files.map(f => {
                        const rawContent = (() => {
                          const gfs = scanResult.generatedFiles as Array<{ fileName?: string; content?: string }> | undefined;
                          return gfs?.find(g => g.fileName === f.name)?.content ?? "";
                        })();
                        return (
                          <div key={f.name} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 12px",
                            background: "var(--bg-2)",
                            border: "1px solid var(--border-dim)",
                            borderRadius: "var(--radius)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "12px", fontFamily: "var(--font)", color: "var(--text)" }}>
                                {f.name}
                              </span>
                              {f.tokens !== undefined && (
                                <span className="badge badge-zinc" style={{ fontSize: "10px" }}>
                                  {fmtTokens(f.tokens)}
                                </span>
                              )}
                              {f.bytes !== undefined && (
                                <span style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>
                                  {fmtBytes(f.bytes)}
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {rawContent && (
                                <button
                                  className="btn btn-sm"
                                  onClick={() => void copyFile(f.name, rawContent)}
                                >
                                  {copiedFile === f.name ? "Copied!" : "Copy"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: "20px",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius)",
                    textAlign: "center",
                    fontSize: "12px",
                    color: "var(--text-dimmer)",
                  }}>
                    Scan complete. Check your project root for generated files.
                  </div>
                );
              })()}

              <div style={{ marginTop: "16px" }}>
                <button className="btn" onClick={() => setPageState("idle")}>
                  ← Run again
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* suppress unused var warning for config */}
      {void_ && null}
    </div>
  );
}
