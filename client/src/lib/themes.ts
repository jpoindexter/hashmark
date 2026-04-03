/**
 * Theme system -- seed-based palette with built-in presets.
 * Each theme defines key seed colors; the rest is derived.
 */

export interface ThemeColors {
  bg: string;
  bg2: string;
  bg3: string;
  bg4: string;
  text: string;
  textDim: string;
  textDimmer: string;
  border: string;
  borderDim: string;
  accent: string;
  accentDim: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  purple: string;
  orange: string;
}

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  colors: ThemeColors;
}

export const BUILT_IN_THEMES: Theme[] = [
  {
    id: "conductor",
    name: "Conductor",
    dark: true,
    colors: {
      bg: "#1a1a1a", bg2: "#222222", bg3: "#2a2a2a", bg4: "#333333",
      text: "#e8e4df", textDim: "#9a9590", textDimmer: "#6a6560",
      border: "rgba(255,248,240,0.08)", borderDim: "rgba(255,248,240,0.04)",
      accent: "#d4956a", accentDim: "#b07a52",
      red: "#d46a6a", green: "#7dba6a", yellow: "#d4a54a",
      blue: "#7aa2f7", purple: "#b49af7", orange: "#d4956a",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    dark: true,
    colors: {
      bg: "#1a1b26", bg2: "#1f2335", bg3: "#24283b", bg4: "#292e42",
      text: "#c0caf5", textDim: "#7982a9", textDimmer: "#565f89",
      border: "rgba(192,202,245,0.08)", borderDim: "rgba(192,202,245,0.04)",
      accent: "#7aa2f7", accentDim: "#5d7ec7",
      red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
      blue: "#7aa2f7", purple: "#bb9af7", orange: "#ff9e64",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    dark: true,
    colors: {
      bg: "#1e1e2e", bg2: "#232334", bg3: "#28283d", bg4: "#313244",
      text: "#cdd6f4", textDim: "#a6adc8", textDimmer: "#6c7086",
      border: "rgba(205,214,244,0.08)", borderDim: "rgba(205,214,244,0.04)",
      accent: "#cba6f7", accentDim: "#a87fd4",
      red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
      blue: "#89b4fa", purple: "#cba6f7", orange: "#fab387",
    },
  },
  {
    id: "nord",
    name: "Nord",
    dark: true,
    colors: {
      bg: "#2e3440", bg2: "#333a47", bg3: "#3b4252", bg4: "#434c5e",
      text: "#d8dee9", textDim: "#8fbcbb", textDimmer: "#616e88",
      border: "rgba(216,222,233,0.08)", borderDim: "rgba(216,222,233,0.04)",
      accent: "#88c0d0", accentDim: "#6ba8b8",
      red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", purple: "#b48ead", orange: "#d08770",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    dark: true,
    colors: {
      bg: "#282a36", bg2: "#2d2f3d", bg3: "#343746", bg4: "#3c3f52",
      text: "#f8f8f2", textDim: "#bfbfb6", textDimmer: "#6272a4",
      border: "rgba(248,248,242,0.08)", borderDim: "rgba(248,248,242,0.04)",
      accent: "#bd93f9", accentDim: "#9b73d7",
      red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#8be9fd", purple: "#bd93f9", orange: "#ffb86c",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    dark: true,
    colors: {
      bg: "#0d1117", bg2: "#161b22", bg3: "#1c2128", bg4: "#21262d",
      text: "#e6edf3", textDim: "#8b949e", textDimmer: "#484f58",
      border: "rgba(230,237,243,0.08)", borderDim: "rgba(230,237,243,0.04)",
      accent: "#58a6ff", accentDim: "#388bfd",
      red: "#f85149", green: "#3fb950", yellow: "#d29922",
      blue: "#58a6ff", purple: "#bc8cff", orange: "#d18616",
    },
  },
  {
    id: "light",
    name: "Light",
    dark: false,
    colors: {
      bg: "#f8f8f8", bg2: "#f3f3f3", bg3: "#ededed", bg4: "#e8e8e8",
      text: "rgba(0,0,0,0.87)", textDim: "rgba(0,0,0,0.55)", textDimmer: "rgba(0,0,0,0.30)",
      border: "rgba(0,0,0,0.12)", borderDim: "rgba(0,0,0,0.06)",
      accent: "#d4956a", accentDim: "#b07a52",
      red: "#dc2626", green: "#16a34a", yellow: "#b45309",
      blue: "#2563eb", purple: "#7c3aed", orange: "#c2410c",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    dark: true,
    colors: {
      bg: "#002b36", bg2: "#073642", bg3: "#0a3d4a", bg4: "#0d4654",
      text: "#839496", textDim: "#657b83", textDimmer: "#586e75",
      border: "rgba(131,148,150,0.10)", borderDim: "rgba(131,148,150,0.05)",
      accent: "#b58900", accentDim: "#8a6800",
      red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", purple: "#6c71c4", orange: "#cb4b16",
    },
  },
  {
    id: "one-dark",
    name: "One Dark Pro",
    dark: true,
    colors: {
      bg: "#282c34", bg2: "#2c313a", bg3: "#323842", bg4: "#3a3f4b",
      text: "#abb2bf", textDim: "#7f848e", textDimmer: "#5c6370",
      border: "rgba(171,178,191,0.08)", borderDim: "rgba(171,178,191,0.04)",
      accent: "#61afef", accentDim: "#4d8ac0",
      red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", purple: "#c678dd", orange: "#d19a66",
    },
  },
  {
    id: "ayu-dark",
    name: "Ayu Dark",
    dark: true,
    colors: {
      bg: "#0b0e14", bg2: "#11151c", bg3: "#151a23", bg4: "#1c212b",
      text: "#bfbdb6", textDim: "#73737380", textDimmer: "#565b66",
      border: "rgba(191,189,182,0.06)", borderDim: "rgba(191,189,182,0.03)",
      accent: "#e6b450", accentDim: "#c99a3a",
      red: "#d95757", green: "#7fd962", yellow: "#e6b450",
      blue: "#59c2ff", purple: "#d2a6ff", orange: "#ff8f40",
    },
  },
];

/**
 * Apply a theme by setting CSS custom properties on :root
 */
export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  const c = theme.colors;

  el.style.setProperty("--bg", c.bg);
  el.style.setProperty("--bg-2", c.bg2);
  el.style.setProperty("--bg-3", c.bg3);
  el.style.setProperty("--bg-4", c.bg4);
  el.style.setProperty("--text", c.text);
  el.style.setProperty("--text-dim", c.textDim);
  el.style.setProperty("--text-dimmer", c.textDimmer);
  el.style.setProperty("--border", c.border);
  el.style.setProperty("--border-dim", c.borderDim);
  el.style.setProperty("--accent", c.accent);
  el.style.setProperty("--accent-dim", c.accentDim);
  el.style.setProperty("--red", c.red);
  el.style.setProperty("--green", c.green);
  el.style.setProperty("--yellow", c.yellow);
  el.style.setProperty("--blue", c.blue);
  el.style.setProperty("--purple", c.purple);
  el.style.setProperty("--orange", c.orange);

  el.setAttribute("data-theme", theme.dark ? "dark" : "light");

  // Persist
  localStorage.setItem("studio:theme-id", theme.id);
}

/**
 * Load saved theme or return default
 */
export function loadSavedTheme(): Theme {
  const id = localStorage.getItem("studio:theme-id") ?? "conductor";
  return BUILT_IN_THEMES.find(t => t.id === id) ?? BUILT_IN_THEMES[0];
}
