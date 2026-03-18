/**
 * hashmark studio — Electron main process
 * Starts Hono server, opens native window
 */

import { app, BrowserWindow, Menu, shell, ipcMain } from "electron";
import { createServer } from "../server/index.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const PORT = 3200;

// Load .env.local from project dir
const PROJECT_DIR = process.env.HASHMARK_PROJECT_DIR ?? process.cwd();
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(`${PROJECT_DIR}/.env.local`);
loadEnvFile(`${PROJECT_DIR}/.env`);

// Start Hono server
const STATIC_DIR = resolve(__dirname, "..", "public");
const { server } = createServer({ projectDir: PROJECT_DIR, staticDir: STATIC_DIR, port: PORT });

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    backgroundColor: "#09090b",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: resolve(__dirname, "preload.cjs"),
    },
    title: "hashmark studio",
    icon: resolve(__dirname, "../public/icon.png"),
  });

  win.loadURL(`http://localhost:${PORT}`);

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // DevTools: only open if explicitly requested via env var
  if (process.env.STUDIO_DEVTOOLS === "1") win.webContents.openDevTools({ mode: "detach" });
}

// Native menu
function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "hashmark",
      submenu: [
        { label: "About hashmark studio", role: "about" },
        { type: "separator" },
        { label: "Hide", role: "hide" },
        { label: "Quit", accelerator: "Cmd+Q", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" }, { role: "zoom" }, { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // Server is already started by createServer() via @hono/node-server serve()
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: open in finder
ipcMain.handle("show-in-finder", (_, path: string) => {
  shell.showItemInFolder(path);
});

ipcMain.handle("open-external", (_, url: string) => {
  shell.openExternal(url);
});
