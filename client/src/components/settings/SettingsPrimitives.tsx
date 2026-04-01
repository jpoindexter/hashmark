import type { ReactNode } from "react";

export function SectionView({
  title, description, children,
}: { title: string; description: string; children: ReactNode }) {
  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4 }}>
          {title}
        </h2>
        <div style={{ fontSize: 12, color: "var(--text-dimmer)", lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {children}
      </div>
    </div>
  );
}

export function SettingRow({
  label, hint, children, vertical,
}: { label: string; hint?: string; children: ReactNode; vertical?: boolean }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: vertical ? "column" : "row",
      alignItems: vertical ? "flex-start" : "center",
      justifyContent: "space-between",
      gap: vertical ? 8 : 16,
      padding: "14px 0",
      borderBottom: "1px solid var(--border-dim)",
    }}>
      <div style={{ flex: vertical ? undefined : 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, width: vertical ? "100%" : undefined }}>
        {children}
      </div>
    </div>
  );
}

export function ReadonlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border-dim)" }}>
      {label && (
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div style={{
        fontSize: 12, color: "var(--text-dim)",
        fontFamily: mono ? "var(--font)" : undefined,
        background: "var(--bg-2)", border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius)", padding: "8px 10px",
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
    <div style={{
      display: "inline-flex", background: "var(--bg-4)",
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "4px 12px", border: "none", cursor: "pointer",
            fontSize: 11, fontFamily: "var(--font-ui)",
            background: value === opt.value ? "var(--bg-3)" : "transparent",
            color: value === opt.value ? "var(--text)" : "var(--text-dimmer)",
            fontWeight: value === opt.value ? 600 : 400,
            transition: "background 0.1s, color 0.1s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function InfoNote({ children, variant = "info" }: { children: ReactNode; variant?: "info" | "warning" }) {
  return (
    <div style={{
      background: variant === "warning" ? "rgba(210,153,34,0.08)" : "var(--bg-2)",
      border: `1px solid ${variant === "warning" ? "rgba(210,153,34,0.25)" : "var(--border-dim)"}`,
      borderRadius: "var(--radius)",
      padding: "10px 14px",
      fontSize: 12,
      color: variant === "warning" ? "var(--yellow)" : "var(--text-dim)",
      lineHeight: 1.6,
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{
      background: "var(--bg-2)", border: "1px dashed var(--border)",
      borderRadius: "var(--radius)", padding: "32px 24px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 24, marginBottom: 8, color: "var(--text-dimmer)" }}>{icon}</div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 11, color: "var(--text-dimmer)", lineHeight: 1.5 }}>{description}</div>
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
    <span style={{
      fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em",
      color: isSet ? "var(--accent)" : "var(--text-dimmer)",
      fontFamily: "var(--font-ui)", whiteSpace: "nowrap",
    }}>
      {isSet ? "\u2713 set" : "not set"}
    </span>
  );
}
