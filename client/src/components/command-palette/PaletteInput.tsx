import { ChevronRight } from "lucide-react";

interface PaletteInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (q: string) => void;
  isCommandMode: boolean;
  isLineMode: boolean;
  isSymbolMode: boolean;
  placeholder: string;
}

export default function PaletteInput({
  inputRef,
  query,
  onQueryChange,
  isCommandMode,
  isLineMode,
  isSymbolMode,
  placeholder,
}: PaletteInputProps) {
  const hasPrefix = isCommandMode || isLineMode || isSymbolMode;
  const prefixChar = isCommandMode ? ">" : isLineMode ? ":" : isSymbolMode ? "@" : "";
  const prefixColor = isCommandMode ? "var(--accent)" : "var(--text-dimmer)";

  const displayValue = hasPrefix && query.length > 0 ? query.slice(1) : query;

  return (
    <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-dim)" }}>
      {hasPrefix && (
        <span style={{
          padding: "0 0 0 14px",
          fontSize: 14,
          color: prefixColor,
          fontFamily: "var(--font-ui)",
          whiteSpace: "nowrap",
        }}>
          {prefixChar}
        </span>
      )}
      <input
        ref={inputRef}
        value={displayValue}
        onChange={e => {
          if (hasPrefix) {
            onQueryChange(prefixChar + e.target.value);
          } else {
            onQueryChange(e.target.value);
          }
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          padding: hasPrefix ? "12px 14px 12px 6px" : "12px 14px",
          fontSize: 14,
          fontFamily: "var(--font-ui)",
          color: "var(--text)",
          outline: "none",
        }}
      />
      {!hasPrefix && (
        <span
          title="Switch to command mode"
          style={{
            padding: "0 12px",
            fontSize: 11,
            color: "var(--text-dimmer)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
          onClick={() => {
            onQueryChange(">");
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <ChevronRight size={13} />
        </span>
      )}
    </div>
  );
}
