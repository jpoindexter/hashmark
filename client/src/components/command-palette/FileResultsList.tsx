import { File, Clock } from "lucide-react";
import type { ResultItem } from "./types";
import { fuzzyMatch, extColor } from "./types";

function HighlightedText({
  text,
  indices,
  style,
}: {
  text: string;
  indices: number[];
  style?: React.CSSProperties;
}) {
  if (!indices.length) return <span style={style}>{text}</span>;

  const set = new Set(indices);
  const parts: React.ReactNode[] = [];
  let run = "";
  let runHighlighted = false;

  for (let i = 0; i <= text.length; i++) {
    const isMatch = set.has(i);
    if (i === text.length || isMatch !== runHighlighted) {
      if (run) {
        parts.push(
          runHighlighted
            ? <span key={i} style={{ fontWeight: 600, color: "var(--accent)" }}>{run}</span>
            : <span key={i}>{run}</span>,
        );
      }
      run = i < text.length ? text[i] : "";
      runHighlighted = isMatch;
    } else {
      run += text[i];
    }
  }
  if (run) {
    parts.push(
      runHighlighted
        ? <span key="end" style={{ fontWeight: 600, color: "var(--accent)" }}>{run}</span>
        : <span key="end">{run}</span>,
    );
  }

  return <span style={style}>{parts}</span>;
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="label" style={{
      height: 24,
      padding: "0 12px",
      display: "flex",
      alignItems: "center",
      userSelect: "none" as const,
    }}>
      {label}
    </div>
  );
}

export function ResultRow({
  isActive,
  onClick,
  onMouseEnter,
  left,
  center,
  right,
}: {
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  left: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      data-active={isActive}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        height: 36,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        background: isActive ? "var(--accent-bg)" : "transparent",
        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.05s",
      }}
    >
      {left}
      {center}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export function KeyPill({ keybind }: { keybind: string }) {
  return (
    <span style={{
      fontFamily: "var(--font)",
      fontSize: 10,
      color: "var(--text-dimmer)",
      background: "var(--surface-dim)",
      border: "1px solid var(--border-dim)",
      borderRadius: 3,
      padding: "1px 5px",
      flexShrink: 0,
      letterSpacing: "0.02em",
    }}>
      {keybind}
    </span>
  );
}

interface FileResultsListProps {
  results: Array<ResultItem & { kind: "file" }>;
  activeIdx: number;
  onActiveIdxChange: (idx: number) => void;
  onSelectFile: (path: string) => void;
  filterQuery: string;
  hasRecent: boolean;
  globalIdxStart: number;
}

export default function FileResultsList({
  results,
  activeIdx,
  onActiveIdxChange,
  onSelectFile,
  filterQuery,
  hasRecent,
  globalIdxStart,
}: FileResultsListProps) {
  const recentItems = results.filter(r => r.section === "recent");
  const fileItems = results.filter(r => r.section === "files");
  const showRecentHeader = recentItems.length > 0;
  const showFilesHeader = fileItems.length > 0 && (showRecentHeader || !filterQuery);

  let runningIdx = globalIdxStart;

  return (
    <div>
      {showRecentHeader && <SectionHeader label="Recent" />}
      {!showRecentHeader && filterQuery && <SectionHeader label="Files" />}
      {!showRecentHeader && !filterQuery && !showFilesHeader && <SectionHeader label="Recent" />}

      {recentItems.map((item) => {
        const { file } = item;
        const idx = runningIdx++;
        const isActive = idx === activeIdx;
        const parts = file.path.split("/");
        const dir = parts.slice(0, -1).join("/");
        const match = filterQuery ? fuzzyMatch(filterQuery, file.path) : null;
        const nameStart = file.path.length - file.name.length;
        const nameIndices = match
          ? match.indices.filter(j => j >= nameStart).map(j => j - nameStart)
          : [];

        return (
          <ResultRow
            key={file.path}
            isActive={isActive}
            onClick={() => onSelectFile(file.path)}
            onMouseEnter={() => onActiveIdxChange(idx)}
            left={<Clock size={15} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />}
            center={
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <HighlightedText
                  text={file.name}
                  indices={nameIndices}
                  style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}
                />
                {dir && (
                  <span style={{ fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dir}
                  </span>
                )}
              </span>
            }
            right={
              <span className="label">
                recent
              </span>
            }
          />
        );
      })}

      {showFilesHeader && <SectionHeader label="Files" />}

      {fileItems.map((item) => {
        const { file } = item;
        const idx = runningIdx++;
        const isActive = idx === activeIdx;
        const parts = file.path.split("/");
        const dir = parts.slice(0, -1).join("/");
        const match = filterQuery ? fuzzyMatch(filterQuery, file.path) : null;
        const nameStart = file.path.length - file.name.length;
        const nameIndices = match
          ? match.indices.filter(j => j >= nameStart).map(j => j - nameStart)
          : [];

        return (
          <ResultRow
            key={file.path}
            isActive={isActive}
            onClick={() => onSelectFile(file.path)}
            onMouseEnter={() => onActiveIdxChange(idx)}
            left={<File size={15} style={{ color: extColor(file.ext), flexShrink: 0 }} />}
            center={
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <HighlightedText
                  text={file.name}
                  indices={nameIndices}
                  style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}
                />
                {dir && (
                  <span style={{ fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dir}
                  </span>
                )}
              </span>
            }
          />
        );
      })}
    </div>
  );
}
