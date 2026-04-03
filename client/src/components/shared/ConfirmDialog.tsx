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
    <div className="modal-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-dialog"
        onClick={e => e.stopPropagation()}
        style={{ padding: "20px 24px", minWidth: 320, maxWidth: 420 }}
      >
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: message || inputMode ? 8 : 20,
        }}>
          {title}
        </div>

        {message && (
          <div className="text-body" style={{ marginBottom: inputMode ? 12 : 20 }}>
            {message}
          </div>
        )}

        {inputMode && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
            placeholder={inputPlaceholder}
            style={{ width: "100%", marginBottom: 20 }}
          />
        )}

        <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            ref={confirmBtnRef}
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
