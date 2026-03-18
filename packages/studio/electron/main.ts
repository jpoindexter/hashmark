/**
 * hashmark studio — Electron main process
 * Starts Hono server, opens native window
 */

import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from "electron";
import { createServer } from "../server/index.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const PORT = 3200;

// Config persistence
const CONFIG_DIR = `${app.getPath("home")}/.hashmark`;
const CONFIG_FILE = `${CONFIG_DIR}/studio-config.json`;

interface StudioConfig {
  projectDir?: string;
  recent: string[];
}

function readConfig(): StudioConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Partial<StudioConfig>;
      return { recent: [], ...parsed };
    }
  } catch {}
  return { recent: [] };
}

function writeConfig(config: StudioConfig) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function addToRecent(config: StudioConfig, dir: string): StudioConfig {
  const filtered = config.recent.filter(p => p !== dir);
  const recent = [dir, ...filtered].slice(0, 10);
  return { ...config, recent };
}

// Resolve project dir: env > config file > sentinel
if (!process.env.HASHMARK_PROJECT_DIR) {
  const config = readConfig();
  if (config.projectDir && existsSync(config.projectDir)) {
    process.env.HASHMARK_PROJECT_DIR = config.projectDir;
  } else {
    process.env.HASHMARK_PROJECT_DIR = "__unset__";
  }
}

const PROJECT_DIR = process.env.HASHMARK_PROJECT_DIR;

// Load .env.local from project dir (skip when unset)
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

if (PROJECT_DIR !== "__unset__") {
  loadEnvFile(`${PROJECT_DIR}/.env.local`);
  loadEnvFile(`${PROJECT_DIR}/.env`);
}

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
    icon: resolve(__dirname, "../../assets/icon.svg"),
  });

  win.loadURL(isDev ? `http://localhost:5173` : `http://localhost:${PORT}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

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

// IPC: project picker
ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Project Folder",
    buttonLabel: "Open Project",
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("get-project-dir", () => {
  return process.env.HASHMARK_PROJECT_DIR ?? null;
});

ipcMain.handle("set-project-dir", async (_event, dir: string) => {
  const config = readConfig();
  const updated = addToRecent({ ...config, projectDir: dir }, dir);
  writeConfig(updated);
  process.env.HASHMARK_PROJECT_DIR = dir;
  win?.webContents.reload();
  return true;
});

ipcMain.handle("get-recent-projects", () => {
  const config = readConfig();
  return config.recent;
});
