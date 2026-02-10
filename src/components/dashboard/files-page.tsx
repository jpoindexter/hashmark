"use client";

import { useState } from "react";
import type { GeneratedFile } from "@prisma/client";
import { EmptyState, Button } from "@fabrk/components";
import { FileCode, Download, Archive } from "lucide-react";

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
  repoId,
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

  const handleDownloadFile = () => {
    if (!selectedFile) return;
    const blob = new Blob([selectedFile.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    window.location.href = `/api/scan/${repoId}/download`;
  };

  if (!hasScan) {
    return (
      <EmptyState
        icon={FileCode}
        title="NO SCANS COMPLETED"
        description="Run a scan first to generate context files"
      />
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={FileCode}
        title="NO FILES GENERATED"
        description="The scan completed but no files were generated"
      />
    );
  }

  return (
    <div className="mono-stack">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <p className="type-caption text-muted-foreground">
          {files.length} format{files.length !== 1 ? "s" : ""} generated
        </p>
        <Button variant="outline" size="sm" onClick={handleDownloadAll}>
          <Archive className="mr-2 h-3 w-3" />
          {"> DOWNLOAD ALL (.ZIP)"}
        </Button>
      </div>

      <div className="flex gap-[var(--grid-4)]">
        {/* File list (left panel) */}
        <div className="w-64 shrink-0 border border-border">
          <div className="border-b border-border px-[var(--grid-4)] py-[var(--grid-4)]">
            <p className="type-label text-muted-foreground">
              [FORMATS] ({files.length})
            </p>
          </div>
          <ul>
            {files.map((file) => (
              <li key={file.id}>
                <button
                  onClick={() => setSelected(file.id)}
                  className={`w-full px-[var(--grid-4)] py-[var(--grid-2)] text-left text-xs transition-colors ${
                    selected === file.id
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <p className="font-medium">
                    {FORMAT_LABELS[file.format] ?? file.fileName}
                  </p>
                  {file.tokenCount && (
                    <p className="mt-[var(--grid-1)] text-[10px]">
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
              <div className="flex items-center justify-between border-b border-border px-[var(--grid-4)] py-[var(--grid-4)]">
                <p className="type-label">
                  {selectedFile.fileName}
                </p>
                <div className="flex gap-[var(--grid-2)]">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? "COPIED" : "> COPY"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadFile}>
                    <Download className="mr-2 h-3 w-3" />
                    {"> DOWNLOAD"}
                  </Button>
                </div>
              </div>
              <pre className="max-h-[600px] overflow-auto p-[var(--grid-4)] text-xs leading-relaxed text-muted-foreground">
                {selectedFile.content}
              </pre>
            </>
          ) : (
            <div className="p-[var(--grid-8)] text-center type-caption text-muted-foreground">
              SELECT A FILE TO PREVIEW
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
