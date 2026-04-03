import { useState, useEffect } from "react";
import Toggle from "../shared/Toggle";
import { SectionView, SettingRow, SegmentedControl } from "./SettingsPrimitives";

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function dispatch(key: string, value: unknown) {
  window.dispatchEvent(new CustomEvent("studio:settings-change", { detail: { key, value } }));
}

export default function AppearanceSection() {
  const [theme, setTheme] = useState<"dark" | "light">(() => restore("theme", "dark"));
  const [fontSize, setFontSize] = useState<number>(() => restore("font_size", 13));
  const [uiDensity, setUiDensity] = useState<"comfortable" | "compact">(() => restore("ui_density", "comfortable"));
  const [showLineNums, setShowLineNums] = useState<boolean>(() => restore("line_nums", true));

  useEffect(() => {
    persist("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    window.dispatchEvent(new CustomEvent("studio:theme-change", { detail: theme }));
  }, [theme]);
  useEffect(() => {
    persist("font_size", fontSize);
    document.documentElement.style.setProperty("--font-size-base", `${fontSize}px`);
    dispatch("font_size", fontSize);
  }, [fontSize]);
  useEffect(() => {
    persist("ui_density", uiDensity);
    document.documentElement.setAttribute("data-density", uiDensity);
    dispatch("ui_density", uiDensity);
  }, [uiDensity]);
  useEffect(() => { persist("line_nums", showLineNums); dispatch("line_nums", showLineNums); }, [showLineNums]);

  return (
    <SectionView title="Appearance" description="Customize how the studio looks and feels.">
      <SettingRow label="Theme" hint="Interface color scheme">
        <SegmentedControl
          value={theme}
          options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
          onChange={v => setTheme(v as "dark" | "light")}
        />
      </SettingRow>
      <SettingRow label="Font Size" hint="Base font size for the UI (px)">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range" min={11} max={18} value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            style={{ width: 100, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font)", minWidth: 24 }}>{fontSize}px</span>
        </div>
      </SettingRow>
      <SettingRow label="UI Density" hint="Spacing and padding across the interface">
        <SegmentedControl
          value={uiDensity}
          options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
          onChange={v => setUiDensity(v as "comfortable" | "compact")}
        />
      </SettingRow>
      <SettingRow label="Line Numbers" hint="Show line numbers in file viewer">
        <Toggle checked={showLineNums} onChange={setShowLineNums} />
      </SettingRow>
    </SectionView>
  );
}
