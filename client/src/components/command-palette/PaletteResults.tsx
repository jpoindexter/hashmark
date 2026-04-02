import { Hash, Code } from "lucide-react";
import type { Command, ResultItem, SymbolItem } from "./types";
import FileResultsList, { SectionHeader, ResultRow, KeyPill } from "./FileResultsList";

function symbolKindIcon(kind: SymbolItem["kind"]): React.ReactNode {
  switch (kind) {
    case "function": case "method":
      return <Code size={15} style={{ color: "var(--accent)" }} />;
    case "class": case "interface": case "type":
      return <Hash size={15} style={{ color: "#c586c0" }} />;
    case "const": case "variable":
      return <Hash size={15} style={{ color: "#4fc1ff" }} />;
    default:
      return <Code size={15} style={{ color: "var(--text-dimmer)" }} />;
  }
}

interface PaletteResultsProps {
  listRef: React.RefObject<HTMLDivElement | null>;
  results: ResultItem[];
  activeIdx: number;
  onActiveIdxChange: (idx: number) => void;
  isCommandMode: boolean;
  isLineMode: boolean;
  isSymbolMode: boolean;
  filterQuery: string;
  recentPaths: string[];
  onSelectCommand: (cmd: Command) => void;
  onSelectFile: (path: string) => void;
  onSelectSymbol: (symbol: SymbolItem) => void;
  onGoToLine: (line: number) => void;
}

export default function PaletteResults({
  listRef,
  results,
  activeIdx,
  onActiveIdxChange,
  isCommandMode,
  isLineMode,
  isSymbolMode,
  filterQuery,
  recentPaths,
  onSelectCommand,
  onSelectFile,
  onSelectSymbol,
  onGoToLine,
}: PaletteResultsProps) {
  const isEmpty = results.length === 0;

  const commandSections: Record<string, Command[]> = {};
  if (isCommandMode) {
    for (const item of results) {
      if (item.kind === "command") {
        const sec = item.cmd.section;
        if (!commandSections[sec]) commandSections[sec] = [];
        commandSections[sec].push(item.cmd);
      }
    }
  }

  let globalIdx = 0;

  if (isLineMode) {
    const lineNum = parseInt(filterQuery, 10);
    const isValid = lineNum > 0;
    return (
      <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
        <SectionHeader label="Go to Line" />
        <ResultRow
          isActive={true}
          onClick={() => { if (isValid) onGoToLine(lineNum); }}
          onMouseEnter={() => {}}
          left={<Hash size={15} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />}
          center={
            <span style={{ fontSize: 13, color: isValid ? "var(--text)" : "var(--text-dimmer)" }}>
              {isValid ? `Go to line ${lineNum}` : "Type a line number..."}
            </span>
          }
          right={isValid ? <KeyPill keybind="Enter" /> : undefined}
        />
        <div style={{
          padding: "4px 12px 6px",
          fontSize: 10,
          color: "var(--text-dimmer)",
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          gap: 12,
          fontFamily: "var(--font-ui)",
          userSelect: "none",
        }}>
          <span>Enter to go</span>
          <span>Esc to close</span>
          <span style={{ marginLeft: "auto" }}>Backspace for files</span>
        </div>
      </div>
    );
  }

  if (isSymbolMode) {
    const currentFile = new URLSearchParams(window.location.search).get("path");
    if (!currentFile) {
      return (
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          <div style={{
            padding: "24px 14px",
            fontSize: 13,
            color: "var(--text-dimmer)",
            textAlign: "center",
            fontFamily: "var(--font-ui)",
          }}>
            No file is currently open
          </div>
        </div>
      );
    }

    const symbolItems = results.filter((r): r is ResultItem & { kind: "symbol" } => r.kind === "symbol");

    return (
      <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
        {symbolItems.length === 0 ? (
          <div style={{
            padding: "24px 14px",
            fontSize: 13,
            color: "var(--text-dimmer)",
            textAlign: "center",
            fontFamily: "var(--font-ui)",
          }}>
            {filterQuery ? `No symbols match "${filterQuery}"` : "No symbols found in this file"}
          </div>
        ) : (
          <>
            <SectionHeader label="Symbols" />
            {symbolItems.map((item, i) => (
              <ResultRow
                key={`${item.symbol.name}-${item.symbol.line}`}
                isActive={i === activeIdx}
                onClick={() => onSelectSymbol(item.symbol)}
                onMouseEnter={() => onActiveIdxChange(i)}
                left={symbolKindIcon(item.symbol.kind)}
                center={
                  <span className="flex-row gap-2" style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>{item.symbol.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{item.symbol.kind}</span>
                  </span>
                }
                right={
                  <span style={{ fontSize: 11, color: "var(--text-dimmer)", flexShrink: 0 }}>
                    :{item.symbol.line}
                  </span>
                }
              />
            ))}
          </>
        )}
        <div style={{
          padding: "4px 12px 6px",
          fontSize: 10,
          color: "var(--text-dimmer)",
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          gap: 12,
          fontFamily: "var(--font-ui)",
          userSelect: "none",
        }}>
          <span>Enter to go</span>
          <span>Esc to close</span>
          <span style={{ marginLeft: "auto" }}>Backspace for files</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
      {isEmpty ? (
        <div style={{
          padding: "24px 14px",
          fontSize: 13,
          color: "var(--text-dimmer)",
          textAlign: "center",
          fontFamily: "var(--font-ui)",
        }}>
          {filterQuery
            ? `No ${isCommandMode ? "commands" : "files"} match "${filterQuery}"`
            : isCommandMode ? "No commands available" : "No recent files"}
        </div>
      ) : isCommandMode ? (
        Object.entries(commandSections).map(([section, cmds]) => (
          <div key={section}>
            <SectionHeader label={section} />
            {cmds.map(cmd => {
              const idx = globalIdx++;
              return (
                <ResultRow
                  key={cmd.id}
                  isActive={idx === activeIdx}
                  onClick={() => onSelectCommand(cmd)}
                  onMouseEnter={() => onActiveIdxChange(idx)}
                  left={<span style={{ color: "var(--text-dimmer)", display: "flex", alignItems: "center", flexShrink: 0 }}>{cmd.icon}</span>}
                  center={
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>{cmd.label}</span>
                      {cmd.description && (
                        <span style={{ fontSize: 12, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cmd.description}
                        </span>
                      )}
                    </span>
                  }
                  right={cmd.keybind ? <KeyPill keybind={cmd.keybind} /> : undefined}
                />
              );
            })}
          </div>
        ))
      ) : (
        <FileResultsList
          results={results as Array<ResultItem & { kind: "file" }>}
          activeIdx={activeIdx}
          onActiveIdxChange={onActiveIdxChange}
          onSelectFile={onSelectFile}
          filterQuery={filterQuery}
          hasRecent={recentPaths.length > 0}
          globalIdxStart={0}
        />
      )}

      {!isEmpty && (
        <div style={{
          padding: "4px 12px 6px",
          fontSize: 10,
          color: "var(--text-dimmer)",
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          gap: 12,
          fontFamily: "var(--font-ui)",
          userSelect: "none",
        }}>
          <span>Enter to select</span>
          <span>Esc to close</span>
          {!isCommandMode && <span style={{ marginLeft: "auto" }}>&gt; commands &nbsp; : line &nbsp; @ symbol</span>}
          {isCommandMode && <span style={{ marginLeft: "auto" }}>Backspace for files</span>}
        </div>
      )}
    </div>
  );
}
