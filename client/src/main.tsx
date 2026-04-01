import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import { initTauriBridge } from "./lib/tauri-bridge";

// Must run before window.studio is read below
initTauriBridge();

// Restore appearance settings before first paint (matches Settings.tsx `studio:` prefix)
const savedTheme = localStorage.getItem("studio:theme");
if (savedTheme) {
  try {
    const theme = JSON.parse(savedTheme) as string;
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch { /* noop */ }
}

const savedDensity = localStorage.getItem("studio:ui_density");
if (savedDensity) {
  try {
    const density = JSON.parse(savedDensity) as string;
    if (density === "compact" || density === "comfortable") {
      document.documentElement.setAttribute("data-density", density);
    }
  } catch { /* noop */ }
}

// Detect Tauri -- enable vibrancy transparency on sidebar/titlebar
if ("__TAURI_INTERNALS__" in window) {
  document.documentElement.setAttribute("data-tauri", "true");
}

const savedFontSize = localStorage.getItem("studio:font_size");
if (savedFontSize) {
  try {
    const size = JSON.parse(savedFontSize) as number;
    if (size >= 11 && size <= 18) {
      document.documentElement.style.setProperty("--font-size-base", `${size}px`);
    }
  } catch { /* noop */ }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
