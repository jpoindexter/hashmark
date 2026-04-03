import type { ScanResult, ScanDelta } from "../../components/ScanProgress.tsx";
import type { GeneratedFileInfo } from "./types";
import { fmtTokens, fmtBytes } from "./types";

interface ScanResultsProps {
  scanResult: ScanResult;
  scanDelta: ScanDelta | null;
  generatedFiles: GeneratedFileInfo[];
  copiedFile: string | null;
  onCopyFile: (name: string, content: string) => void;
  onReset: () => void;
}

export default function ScanResults({
  scanResult,
  scanDelta,
  generatedFiles,
  copiedFile,
  onCopyFile,
  onReset,
}: ScanResultsProps) {
  return (
    <div className="fade-in">

      {/* Delta summary */}
      {scanDelta && Object.keys(scanDelta).length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div className="label mb-2">
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
      {generatedFiles.length > 0 ? (
        <div>
          <div className="label mb-2">
            Output files
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {generatedFiles.map(f => {
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
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
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
                    {f.path && (
                      <div style={{ fontSize: "10px", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                        {f.path}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {rawContent && (
                      <button
                        className="btn btn-sm"
                        onClick={() => onCopyFile(f.name, rawContent)}
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
      )}

      <div style={{ marginTop: "16px" }}>
        <button className="btn" onClick={onReset}>
          ← Run again
        </button>
      </div>
    </div>
  );
}
