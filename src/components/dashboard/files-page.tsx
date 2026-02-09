"use client";

import { useState } from "react";
import type { GeneratedFile } from "@prisma/client";

const FORMAT_LABELS: Record<string, string> = {
  AGENTS_MD: "AGENTS.md",
  CLAUDE_MD: "CLAUDE.md",
  CURSORRULES: ".cursorrules",
  CURSOR_MDC: ".cursor/rules/*.mdc",
  COPILOT_INSTRUCTIONS: "copilot-instructions.md",
  WINDSURFRULES: ".windsurfrules",
  GEMINI_MD: "GEMINI.md",
  CLINE_RULES: ".clinerules",
};

export function FilesPage({
  files,
  hasScan,
}: {
  repoId: string;
  files: GeneratedFile[];
  hasScan: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(
    files[0]?.id ?? null
  );
  const [copied, setCopied] = useState(false);

  const selectedFile = files.find((f) => f.id === selected) ?? null;

  const handleCopy = async () => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!selectedFile) return;
    const blob = new Blob([selectedFile.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasScan) {
    return (
      <div className="border border-dashed border-border p-12 text-center">
        <p className="text-2xl font-bold text-accent">#</p>
        <p className="mt-2 text-sm uppercase tracking-wider text-muted-foreground">
          NO SCANS COMPLETED
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Run a scan first to generate context files
        </p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="border border-dashed border-border p-12 text-center">
        <p className="text-2xl font-bold text-accent">#</p>
        <p className="mt-2 text-sm uppercase tracking-wider text-muted-foreground">
          NO FILES GENERATED
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The scan completed but no files were generated
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* File list (left panel) */}
      <div className="w-64 shrink-0 border border-border">
        <div className="border-b border-border px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            [FORMATS] ({files.length})
          </p>
        </div>
        <ul>
          {files.map((file) => (
            <li key={file.id}>
              <button
                onClick={() => setSelected(file.id)}
                className={`w-full px-4 py-2 text-left text-xs transition-colors ${
                  selected === file.id
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <p className="font-medium">
                  {FORMAT_LABELS[file.format] ?? file.fileName}
                </p>
                {file.tokenCount && (
                  <p className="mt-1 text-[10px]">
                    {file.tokenCount.toLocaleString()} tokens
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Preview (right panel) */}
      <div className="flex-1 border border-border">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wider">
                {selectedFile.fileName}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {copied ? "COPIED" : "> COPY"}
                </button>
                <button
                  onClick={handleDownload}
                  className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {"> DOWNLOAD"}
                </button>
              </div>
            </div>
            <pre className="max-h-[600px] overflow-auto p-4 text-xs leading-relaxed text-muted-foreground">
              {selectedFile.content}
            </pre>
          </>
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground">
            SELECT A FILE TO PREVIEW
          </div>
        )}
      </div>
    </div>
  );
}
