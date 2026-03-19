import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";

const savedTheme = localStorage.getItem("settings_theme");
if (savedTheme) {
  try {
    const theme = JSON.parse(savedTheme) as string;
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch { /* noop */ }
}

const savedDensity = localStorage.getItem("settings_ui_density");
if (savedDensity) {
  try {
    const density = JSON.parse(savedDensity) as string;
    if (density === "compact" || density === "comfortable") {
      document.documentElement.setAttribute("data-density", density);
    }
  } catch { /* noop */ }
}

const savedFontSize = localStorage.getItem("settings_font_size");
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
