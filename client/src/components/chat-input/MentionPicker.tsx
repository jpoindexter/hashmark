import { useState, useEffect } from "react";
import { fetchApi } from "../../lib/api";
import {
  PICKER_CONTAINER_STYLE,
  PICKER_GROUP_LABEL_STYLE,
  pickerRowStyle,
  usePicker,
} from "./picker-shared";
import { PickerFooter } from "./PickerFooter";

export interface FileEntry {
  name: string;
  path: string;
  ext?: string;
}

export function useMentionFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  useEffect(() => {
    fetchApi("/api/files/list")
      .then(r => r.json())
      .then((d: { files?: FileEntry[] }) => setFiles(d.files ?? []))
      .catch(() => {});
  }, []);
  return files;
}

const EXT_COLORS: Record<string, string> = {
  ts: "var(--blue)", tsx: "var(--blue)", js: "var(--yellow)", jsx: "var(--yellow)",
  py: "var(--accent)", go: "#00add8", rs: "#dea584", md: "var(--text-dim)",
  json: "var(--text-dim)", css: "#264de4", html: "#e34c26",
};

export function MentionPicker({
  query, files, onSelect, onDismiss,
}: {
  query: string;
  files: FileEntry[];
  onSelect: (file: FileEntry) => void;
  onDismiss: () => void;
}) {
  const q = query.toLowerCase();
  const filtered = q
    ? files.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
    : files.slice(0, 20);

  const { activeIdx, setActiveIdx, listRef } = usePicker(query, filtered, onSelect, onDismiss);

  if (filtered.length === 0) return null;

  return (
    <div ref={listRef} style={{ ...PICKER_CONTAINER_STYLE, maxHeight: 280 }}>
      <div style={PICKER_GROUP_LABEL_STYLE}>Files</div>
      {filtered.map((file, idx) => {
        const isActive = idx === activeIdx;
        const color = file.ext ? (EXT_COLORS[file.ext] ?? "var(--text-dimmer)") : "var(--text-dimmer)";
        const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
        return (
          <div
            key={file.path}
            data-active={isActive}
            onClick={() => onSelect(file)}
            onMouseEnter={() => setActiveIdx(idx)}
            style={{ ...pickerRowStyle(isActive), gap: 8, padding: "5px 12px" }}
          >
            <span style={{ fontFamily: "var(--font)", fontSize: 10, fontWeight: 600, color, minWidth: 22, textAlign: "center", flexShrink: 0 }}>
              {file.ext ? file.ext.toUpperCase().slice(0, 2) : "  "}
            </span>
            <span style={{ fontFamily: "var(--font)", fontSize: 12, color: isActive ? "var(--text)" : "var(--text-dim)", flexShrink: 0 }}>
              {file.name}
            </span>
            {dir && (
              <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {dir}
              </span>
            )}
          </div>
        );
      })}
      <PickerFooter />
    </div>
  );
}

export function getAtQuery(val: string, cursorPos: number): string | null {
  const before = val.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const segment = before.slice(atIdx + 1);
  if (segment.includes(" ") || segment.includes("\n")) return null;
  return segment;
}
