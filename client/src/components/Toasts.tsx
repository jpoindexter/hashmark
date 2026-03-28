import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Info, CheckCircle, AlertTriangle, XCircle, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  title?: string;
  variant?: ToastVariant;
  duration?: number; // ms — undefined = default per variant, 0 = persistent
  actions?: ToastAction[];
}

interface ToastItem extends Required<Omit<ToastOptions, "duration">> {
  id: string;
  message: string;
  duration: number;
  createdAt: number;
  exiting: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  info: 4000,
  success: 4000,
  warning: 4000,
  error: 6000,
};

const MAX_TOASTS = 4;

const VARIANT_COLORS: Record<ToastVariant, string> = {
  info: "var(--blue)",
  success: "var(--accent)",
  warning: "var(--yellow)",
  error: "var(--red)",
};

const VARIANT_ICONS: Record<ToastVariant, React.FC<{ size: number; color: string }>> = {
  info: ({ size, color }) => <Info size={size} color={color} strokeWidth={1.5} />,
  success: ({ size, color }) => <CheckCircle size={size} color={color} strokeWidth={1.5} />,
  warning: ({ size, color }) => <AlertTriangle size={size} color={color} strokeWidth={1.5} />,
  error: ({ size, color }) => <XCircle size={size} color={color} strokeWidth={1.5} />,
};

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

type Listener = (item: ToastItem) => void;
type DismissListener = (id: string) => void;

const addListeners = new Set<Listener>();
const dismissListeners = new Set<DismissListener>();

let idCounter = 0;
function nextId() {
  return `toast-${++idCounter}-${Date.now()}`;
}

function emit(message: string, options: ToastOptions = {}) {
  const variant: ToastVariant = options.variant ?? "info";
  const hasActions = (options.actions ?? []).length > 0;
  // Warnings with actions are persistent (never auto-dismiss)
  const defaultDuration = variant === "warning" && hasActions ? 0 : DEFAULT_DURATIONS[variant];
  const duration =
    options.duration !== undefined ? options.duration : defaultDuration;

  const item: ToastItem = {
    id: nextId(),
    message,
    title: options.title ?? "",
    variant,
    duration,
    actions: options.actions ?? [],
    createdAt: Date.now(),
    exiting: false,
  };

  addListeners.forEach((fn) => fn(item));
  return item.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function toast(message: string, options?: ToastOptions) {
  return emit(message, options);
}

toast.success = (message: string, options?: Omit<ToastOptions, "variant">) =>
  emit(message, { ...options, variant: "success" });

toast.error = (message: string, options?: Omit<ToastOptions, "variant">) =>
  emit(message, { ...options, variant: "error" });

toast.warning = (message: string, options?: Omit<ToastOptions, "variant">) =>
  emit(message, { ...options, variant: "warning" });

toast.info = (message: string, options?: Omit<ToastOptions, "variant">) =>
  emit(message, { ...options, variant: "info" });

toast.dismiss = (id: string) => {
  dismissListeners.forEach((fn) => fn(id));
};

export { toast };

// ---------------------------------------------------------------------------
// Global toast store (for useToasts hook)
// ---------------------------------------------------------------------------

let _toasts: ToastItem[] = [];
const _storeListeners = new Set<() => void>();

function _notifyStore() {
  _storeListeners.forEach((fn) => fn());
}

function _getSnapshot() {
  return _toasts;
}

function _subscribe(listener: () => void) {
  _storeListeners.add(listener);
  return () => { _storeListeners.delete(listener); };
}

export function useToasts() {
  const toasts = useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
  return {
    toasts,
    dismiss: (id: string) => toast.dismiss(id),
  };
}

// ---------------------------------------------------------------------------
// CSS keyframes injected once
// ---------------------------------------------------------------------------

const STYLE_ID = "hashmark-toast-keyframes";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes toast-slide-in {
      from { opacity: 0; transform: translateX(100%); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes toast-slide-out {
      from { opacity: 1; transform: translateX(0); }
      to   { opacity: 0; transform: translateX(110%); }
    }
    @keyframes toast-progress {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Individual Toast card
// ---------------------------------------------------------------------------

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastCard({ item, onDismiss }: ToastCardProps) {
  const { id, message, title, variant, duration, actions, exiting } = item;
  const accentColor = VARIANT_COLORS[variant];
  const Icon = VARIANT_ICONS[variant];
  const hovering = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingRef = useRef<number>(duration);

  const dismiss = useCallback(() => onDismiss(id), [id, onDismiss]);

  // Start / resume the auto-dismiss timer
  const startTimer = useCallback(() => {
    if (duration === 0 || hovering.current) return;
    const remaining = remainingRef.current;
    if (remaining <= 0) return;

    // Resume progress bar animation
    if (progressRef.current) {
      progressRef.current.style.animationPlayState = "running";
      // Re-calc remaining fraction for the animation duration
      const fraction = remaining / duration;
      progressRef.current.style.animationDuration = `${remaining}ms`;
      progressRef.current.style.transform = `scaleX(${fraction})`;
      // Force reflow then restart animation
      void progressRef.current.offsetWidth;
      progressRef.current.style.animation = "none";
      void progressRef.current.offsetWidth;
      progressRef.current.style.animation = `toast-progress ${remaining}ms linear forwards`;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, remaining);
  }, [dismiss, duration]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = Date.now() - startTimeRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);

    if (progressRef.current) {
      progressRef.current.style.animationPlayState = "paused";
    }
  }, []);

  useEffect(() => {
    if (duration === 0 || exiting) return;

    // Initial progress bar setup
    if (progressRef.current) {
      progressRef.current.style.animation = `toast-progress ${duration}ms linear forwards`;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseEnter = () => {
    hovering.current = true;
    pauseTimer();
  };

  const handleMouseLeave = () => {
    hovering.current = false;
    startTimer();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        width: 320,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: "var(--radius, 4px)",
        boxShadow: "var(--shadow-lg)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflow: "hidden",
        pointerEvents: "auto",
        animation: exiting
          ? "toast-slide-out 150ms ease-in forwards"
          : "toast-slide-in 200ms ease-out",
        flexShrink: 0,
      }}
    >
      {/* Header row: icon + text + dismiss */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Icon */}
        <div style={{ flexShrink: 0, marginTop: 1 }}>
          <Icon size={15} color={accentColor} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {title ? (
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: message ? 2 : 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: title ? "var(--text-dim)" : "var(--text)",
              lineHeight: "1.5",
              wordBreak: "break-word",
            }}
          >
            {message}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          aria-label="Dismiss notification"
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            background: "none",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            color: "var(--text-dimmer)",
            padding: 0,
            marginTop: -1,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--hover-bg-strong)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--text-dimmer)";
          }}
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 25 }}>
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => {
                action.onClick();
                dismiss();
              }}
              style={{
                background: "var(--bg-4)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius, 4px)",
                color: "var(--text-dim)",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: 400,
                padding: "2px 8px",
                cursor: "pointer",
                lineHeight: "1.5",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--text-dimmer)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border)";
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {duration > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "var(--border-dim, var(--border))",
          }}
        >
          <div
            ref={progressRef}
            style={{
              height: "100%",
              background: accentColor,
              transformOrigin: "left center",
              opacity: 0.6,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToastContainer
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const [toasts, setToastsRaw] = useState<ToastItem[]>([]);

  const setToasts: typeof setToastsRaw = (updater) => {
    setToastsRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      _toasts = next;
      _notifyStore();
      return next;
    });
  };

  useEffect(() => {
    injectStyles();
  }, []);

  // Subscribe to new toasts
  useEffect(() => {
    const onAdd: Listener = (item) => {
      setToasts((prev) => {
        const next = [item, ...prev];
        // Keep newest MAX_TOASTS; extras at the end get dropped
        return next.slice(0, MAX_TOASTS);
      });
    };

    addListeners.add(onAdd);
    return () => { addListeners.delete(onAdd); };
  }, []);

  // Subscribe to imperative dismiss calls
  useEffect(() => {
    const onDismiss: DismissListener = (id) => {
      handleDismiss(id);
    };
    dismissListeners.add(onDismiss);
    return () => { dismissListeners.delete(onDismiss); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = useCallback((id: string) => {
    // Mark as exiting so animation plays
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );

    // Remove after exit animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 160);
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 29,
        right: 7,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        // Newest on top: column-reverse would flip visual order but we push
        // newest to front of array, so normal column order is correct.
      }}
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={handleDismiss} />
      ))}
    </div>,
    document.body
  );
}
