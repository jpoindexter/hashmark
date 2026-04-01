import { useState, useEffect, useRef, useCallback } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** If set, shows an input field and passes the value to onConfirmWithValue */
  inputMode?: boolean;
  inputPlaceholder?: string;
  inputDefaultValue?: string;
  onConfirmWithValue?: (value: string) => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
  inputMode = false,
  inputPlaceholder = "",
  inputDefaultValue = "",
  onConfirmWithValue,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState(inputDefaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, true);

  useEffect(() => {
    if (open) {
      setInputValue(inputDefaultValue);
      setTimeout(() => {
        if (inputMode) inputRef.current?.focus();
        else confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [open, inputDefaultValue, inputMode]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  const handleConfirm = useCallback(() => {
    if (inputMode && onConfirmWithValue) {
      onConfirmWithValue(inputValue);
    } else {
      onConfirm();
    }
  }, [inputMode, onConfirmWithValue, onConfirm, inputValue]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--overlay-bg)",
        backdropFilter: "blur(2px)",
        animation: "fadeIn 0.1s ease",
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          minWidth: 320,
          maxWidth: 420,
          boxShadow: "var(--shadow-lg)",
          fontFamily: "var(--font-ui)",
          animation: "dropdownIn 0.15s ease-out",
        }}
      >
        {/* Title */}
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: message || inputMode ? 8 : 20,
        }}>
          {title}
        </div>

        {/* Message */}
        {message && (
          <div style={{
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.5,
            marginBottom: inputMode ? 12 : 20,
          }}>
            {message}
          </div>
        )}

        {/* Input */}
        {inputMode && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
            placeholder={inputPlaceholder}
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "var(--font)",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--text)",
              outline: "none",
              marginBottom: 20,
              boxSizing: "border-box",
            }}
          />
        )}

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontFamily: "var(--font-ui)",
              fontWeight: 500,
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--text-dim)",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-4)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-3)"; }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              background: danger ? "var(--red)" : "var(--accent)",
              border: "none",
              borderRadius: "var(--radius)",
              color: danger ? "#fff" : "var(--bg)",
              cursor: "pointer",
              transition: "opacity 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
