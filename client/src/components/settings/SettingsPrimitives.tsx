import type { ReactNode } from "react";

export function SectionView({
  title, description, children,
}: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h2 className="settings-section-title">{title}</h2>
        <div className="settings-section-desc">{description}</div>
      </div>
      <div className="flex-col">
        {children}
      </div>
    </div>
  );
}

export function SettingRow({
  label, hint, children, vertical,
}: { label: string; hint?: string; children: ReactNode; vertical?: boolean }) {
  return (
    <div className={vertical ? "settings-row-vertical" : "settings-row"}>
      <div style={{ flex: vertical ? undefined : 1, minWidth: 0 }}>
        <div className="settings-row-label">{label}</div>
        {hint && <div className="settings-row-hint">{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, width: vertical ? "100%" : undefined }}>
        {children}
      </div>
    </div>
  );
}

export function ReadonlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="divider" style={{ padding: "14px 0" }}>
      {label && <div className="label mb-2">{label}</div>}
      <div className="surface" style={{
        padding: "8px 10px",
        fontSize: 12,
        color: "var(--text-dim)",
        fontFamily: mono ? "var(--font)" : undefined,
      }}>
        {value}
      </div>
    </div>
  );
}

export function SegmentedControl({
  value, options, onChange,
}: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="segmented-control">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`segmented-control-item${value === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function InfoNote({ children, variant = "info" }: { children: ReactNode; variant?: "info" | "warning" }) {
  return (
    <div className={variant === "warning" ? "info-note-warning" : "info-note"}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{description}</div>
    </div>
  );
}

export interface EnvVar {
  key: string;
  source: string;
}

export function ApiKeyStatus({ envKey, envVars }: { envKey: string; envVars: EnvVar[] }) {
  const found = envVars.find(v => v.key === envKey);
  const isSet = found !== undefined;
  return (
    <span className="text-micro" style={{
      color: isSet ? "var(--accent)" : undefined,
      whiteSpace: "nowrap",
    }}>
      {isSet ? "\u2713 set" : "not set"}
    </span>
  );
}
