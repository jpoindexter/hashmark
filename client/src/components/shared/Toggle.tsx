interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, size = "md", disabled }: ToggleProps) {
  const trackClass = `toggle-track${size === "sm" ? " toggle-track-sm" : ""}`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={trackClass}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : undefined,
      }}
    >
      <span className="toggle-knob" />
    </button>
  );
}
