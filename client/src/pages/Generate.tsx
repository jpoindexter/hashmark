import { useState, useEffect, useCallback, useRef } from "react";
import ScanProgress, { type ScanResult, type ScanDelta } from "../components/ScanProgress.tsx";
import { toast } from "../hooks/useToast.ts";
import { PageShell } from "../components/shared/PageShell.tsx";
import { fetchApi } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import type { ProjectInfo, StalenessInfo, ScanHistory, ScanConfig, GeneratedFileInfo, PageState } from "./generate/types";
import { ALL_FORMATS, freshnessLabel, fmtTokens } from "./generate/types";
import ScanResults from "./generate/ScanResults";

export default function Generate() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [staleness, setStaleness] = useState<StalenessInfo | null>(null);
  const [history, setHistory] = useState<ScanHistory | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    new Set(["CLAUDE.md", "AGENTS.md", ".cursorrules"])
  );

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [rescanChanged, setRescanChanged] = useState(false);
  const [maxTokens, setMaxTokens] = useState("");
  const [includeTests, setIncludeTests] = useState(false);
  const [customRules, setCustomRules] = useState("");

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanDelta, setScanDelta] = useState<ScanDelta | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([
      fetchApi("/api/info").then(r => r.json() as Promise<ProjectInfo>).then(setInfo).catch(() => {}),
      fetchApi("/api/scan/staleness").then(r => r.json() as Promise<StalenessInfo>).then(setStaleness).catch(() => {}),
      fetchApi("/api/scan/history").then(r => r.json() as Promise<ScanHistory>).then(setHistory).catch(() => {}),
      fetchApi("/api/config").then(r => r.json() as Promise<ScanConfig>).then(cfg => {
        if (cfg.formats?.length) setSelectedFormats(new Set(cfg.formats));
        if (cfg.maxTokens && cfg.maxTokens !== 100000) setMaxTokens(String(cfg.maxTokens));
      }).catch(() => {}),
    ]);
  }, []);

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

  const triggerScan = useCallback(() => {
    if (selectedFormats.size === 0) return;
    setPageState("scanning");
    setScanResult(null);
    setScanDelta(null);
    setErrorMsg("");
  }, [selectedFormats]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && pageState === "idle") {
        e.preventDefault();
        triggerScan();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pageState, triggerScan]);

  const handleScanComplete = useCallback((result: ScanResult, delta: ScanDelta | null) => {
    setScanResult(result);
    setScanDelta(delta);
    setPageState("done");
    void fetchApi("/api/scan/staleness").then(r => r.json() as Promise<StalenessInfo>).then(setStaleness).catch(() => {});
    void fetchApi("/api/scan/history").then(r => r.json() as Promise<ScanHistory>).then(setHistory).catch(() => {});

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

  function getGeneratedFiles(): GeneratedFileInfo[] {
    if (!scanResult) return [];
    const files: GeneratedFileInfo[] = [];
    const generated = scanResult.generatedFiles as Array<{ fileName?: string; tokenCount?: number; content?: string }> | undefined;
    if (Array.isArray(generated)) {
      for (const gf of generated) {
        const name = gf.fileName ?? "unknown";
        files.push({
          name,
          tokens: gf.tokenCount,
          bytes: gf.content ? new TextEncoder().encode(gf.content).length : undefined,
          path: info?.projectDir ? `${info.projectDir}/${name}` : undefined,
        });
      }
    }
    if (files.length === 0 && pageState === "done") {
      for (const fmt of selectedFormats) {
        files.push({
          name: fmt,
          path: info?.projectDir ? `${info.projectDir}/${fmt}` : undefined,
        });
      }
    }
    return files;
  }

  const freshness = staleness ? freshnessLabel(staleness) : null;
  const lastSnap = history?.snapshots?.[0];
  return (
    <PageShell>
    <div ref={containerRef}>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "4px" }}>
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
              <span className={`badge ${freshness.cls === "badge-red" ? "" : freshness.cls}`}
                style={freshness.cls === "badge-red" ? {
                  display: "inline-flex", alignItems: "center",
                  padding: "1px 7px", borderRadius: "100px",
                  fontSize: "11px", fontWeight: 600,
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
                  last scanned {fmtDateTime(lastSnap.scannedAt)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scanning */}
      {pageState === "scanning" && (
        <div style={{ marginBottom: "24px" }}>
          <ScanProgress
            onComplete={handleScanComplete}
            onError={handleScanError}
            onCancel={handleScanCancel}
          />
        </div>
      )}

      {/* Form area */}
      {pageState !== "scanning" && (
        <div className="fade-in">

          {/* Format selector */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div className="label">Formats</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-sm" onClick={selectAll}>Select all</button>
                <button className="btn btn-sm" onClick={clearAll}>Clear</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px" }}>
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

          {/* Scan options */}
          <div style={{ marginBottom: "20px" }}>
            <button className="btn btn-sm" onClick={() => setOptionsOpen(o => !o)} style={{ gap: "6px" }}>
              <span style={{ color: "var(--text-dimmer)", fontSize: "10px" }}>{optionsOpen ? "▾" : "▸"}</span>
              Scan options
            </button>

            {optionsOpen && (
              <div className="fade-in" style={{
                marginTop: "10px", padding: "16px",
                background: "var(--bg-2)", border: "1px solid var(--border-dim)",
                borderRadius: "var(--radius)", display: "flex", flexDirection: "column", gap: "14px",
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input type="checkbox" checked={rescanChanged} onChange={e => setRescanChanged(e.target.checked)} style={{ width: "14px", height: "14px", accentColor: "var(--accent)" }} />
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)" }}>--rescan-only-changed</div>
                    <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>Only re-process files changed since last scan</div>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input type="checkbox" checked={includeTests} onChange={e => setIncludeTests(e.target.checked)} style={{ width: "14px", height: "14px", accentColor: "var(--accent)" }} />
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)" }}>--include-tests</div>
                    <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>Include test files in analysis</div>
                  </div>
                </label>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)", marginBottom: "6px" }}>--max-tokens</div>
                  <input type="number" placeholder="e.g. 80000  (empty = no limit)" value={maxTokens} onChange={e => setMaxTokens(e.target.value)} style={{ width: "240px" }} min={1000} />
                  <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "4px" }}>Limit output token count per format</div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text)", fontFamily: "var(--font)", marginBottom: "6px" }}>Custom rules</div>
                  <textarea value={customRules} onChange={e => setCustomRules(e.target.value)} placeholder={"One rule per line:\nAlways use TypeScript strict mode\nPrefer functional components"} rows={4} style={{ width: "100%", resize: "vertical" }} />
                  <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "4px" }}>Appended to the generated context as project-specific rules</div>
                </div>
              </div>
            )}
          </div>

          {/* Generate button */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <button className="btn btn-primary" onClick={triggerScan} disabled={selectedFormats.size === 0}>
              generate context
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
              background: "var(--red-bg)", border: "1px solid rgba(248,81,73,.25)",
              borderRadius: "var(--radius)", fontSize: "12px", color: "var(--red)",
              marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>{errorMsg}</span>
              <button className="btn btn-sm" onClick={() => setPageState("idle")}>Dismiss</button>
            </div>
          )}

          {/* Results */}
          {pageState === "done" && scanResult && (
            <ScanResults
              scanResult={scanResult}
              scanDelta={scanDelta}
              generatedFiles={getGeneratedFiles()}
              copiedFile={copiedFile}
              onCopyFile={(name, content) => void copyFile(name, content)}
              onReset={() => setPageState("idle")}
            />
          )}
        </div>
      )}

    </div>
    </PageShell>
  );
}
