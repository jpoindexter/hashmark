interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}

const SIZES = {
  sm: { track: { w: 28, h: 16, r: 8 }, knob: { d: 10, offset: 3 }, travel: 12 },
  md: { track: { w: 32, h: 18, r: 9 }, knob: { d: 12, offset: 3 }, travel: 14 },
};

export default function Toggle({ checked, onChange, size = "md", disabled }: ToggleProps) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-block",
        width: s.track.w,
        height: s.track.h,
        background: checked ? "var(--accent)" : "var(--bg-4)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
        borderRadius: s.track.r,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s, border-color 0.15s",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute",
        top: s.knob.offset,
        left: checked ? s.travel : s.knob.offset,
        width: s.knob.d,
        height: s.knob.d,
        borderRadius: "50%",
        background: checked ? "var(--color-on-accent)" : "var(--text)",
        transition: "left 0.15s",
      }} />
    </button>
  );
}
