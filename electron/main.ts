/**
 * hashmark studio — Electron main process
 * Starts Hono server, opens native window
 */

import { app, BrowserWindow, Menu, shell, ipcMain, dialog, nativeImage } from "electron";
import { createServer, killAllActiveSessions } from "../server/index.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const PORT = 3200;

// Set app name before ready so dock/menu bar shows correctly
app.setName("hashmark studio");

// Config persistence
const CONFIG_DIR = `${app.getPath("home")}/.hashmark`;
const CONFIG_FILE = `${CONFIG_DIR}/studio-config.json`;

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

interface StudioConfig {
  projectDir?: string;
  recent: string[];
  windowState?: WindowState;
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

function saveWindowState() {
  if (!win) return;
  const config = readConfig();
  const maximized = win.isMaximized();
  const bounds = win.getBounds();
  const windowState: WindowState = maximized
    ? { width: bounds.width, height: bounds.height, maximized: true }
    : { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  writeConfig({ ...config, windowState });
}

function createWindow() {
  const config = readConfig();
  const ws = config.windowState;

  win = new BrowserWindow({
    width: ws?.width ?? 1400,
    height: ws?.height ?? 900,
    x: ws?.x,
    y: ws?.y,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 13, y: 8 },
    vibrancy: "under-window",
    backgroundColor: "#0d1117",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: resolve(__dirname, "preload.cjs"),
    },
    title: "hashmark studio",
    icon: resolve(__dirname, "../../assets/icon.png"),
  });

  if (ws?.maximized) win.maximize();

  const appUrl = isDev ? `http://localhost:3201` : `http://localhost:${PORT}`;
  win.loadURL(appUrl);

  // Retry loading if server isn't ready yet
  win.webContents.on("did-fail-load", (_event, _code, _desc, url) => {
    if (url.includes("localhost")) {
      setTimeout(() => win?.loadURL(appUrl), 1000);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Persist window state on move/resize/maximize
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowState, 500);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", saveWindowState);
  win.on("unmaximize", saveWindowState);
  win.on("close", saveWindowState);

  // Always open DevTools in development (detached window)
  if (isDev || process.env.STUDIO_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  win?.webContents.send(channel, ...args);
}

// Native menu
function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    // ── hashmark ──────────────────────────────────────────────────────────
    {
      label: "hashmark studio",
      submenu: [
        { label: "About hashmark studio", role: "about" },
        { type: "separator" },
        {
          label: "Preferences...",
          accelerator: "Cmd+,",
          click: () => sendToRenderer("menu:navigate", "/settings"),
        },
        { type: "separator" },
        { label: "Hide hashmark studio", role: "hide" },
        { label: "Hide Others", role: "hideOthers" },
        { label: "Show All", role: "unhide" },
        { type: "separator" },
        { label: "Quit hashmark studio", accelerator: "Cmd+Q", role: "quit" },
      ],
    },

    // ── File ──────────────────────────────────────────────────────────────
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "Cmd+Shift+N",
          click: () => createWindow(),
        },
        { type: "separator" },
        {
          label: "Open Project...",
          accelerator: "Cmd+Shift+O",
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ["openDirectory"],
              title: "Open Project",
              buttonLabel: "Open",
            });
            if (!result.canceled && result.filePaths[0]) {
              const dir = result.filePaths[0];
              const config = readConfig();
              const updated = addToRecent({ ...config, projectDir: dir }, dir);
              writeConfig(updated);
              process.env.HASHMARK_PROJECT_DIR = dir;
              win?.webContents.reload();
            }
          },
        },
        { type: "separator" },
        {
          label: "Close Window",
          accelerator: "Cmd+Shift+W",
          role: "close",
        },
      ],
    },

    // ── Edit ──────────────────────────────────────────────────────────────
    {
      label: "Edit",
      submenu: [
        { role: "undo", accelerator: "Cmd+Z" },
        { role: "redo", accelerator: "Cmd+Shift+Z" },
        { type: "separator" },
        { role: "cut", accelerator: "Cmd+X" },
        { role: "copy", accelerator: "Cmd+C" },
        { role: "paste", accelerator: "Cmd+V" },
        { role: "pasteAndMatchStyle", accelerator: "Cmd+Shift+V" },
        { role: "delete" },
        { role: "selectAll", accelerator: "Cmd+A" },
        { type: "separator" },
        {
          label: "Find",
          accelerator: "Cmd+F",
          click: () => sendToRenderer("menu:find"),
        },
        {
          label: "Find Next",
          accelerator: "Cmd+G",
          click: () => sendToRenderer("menu:find-next"),
        },
        {
          label: "Find Previous",
          accelerator: "Cmd+Shift+G",
          click: () => sendToRenderer("menu:find-prev"),
        },
      ],
    },

    // ── Selection ─────────────────────────────────────────────────────────
    {
      label: "Selection",
      submenu: [
        { role: "selectAll" },
        {
          label: "Expand Selection",
          accelerator: "Shift+Alt+Right",
          click: () => sendToRenderer("menu:expand-selection"),
        },
        {
          label: "Shrink Selection",
          accelerator: "Shift+Alt+Left",
          click: () => sendToRenderer("menu:shrink-selection"),
        },
        { type: "separator" },
        {
          label: "Copy Line Up",
          accelerator: "Shift+Alt+Up",
          click: () => sendToRenderer("menu:copy-line-up"),
        },
        {
          label: "Copy Line Down",
          accelerator: "Shift+Alt+Down",
          click: () => sendToRenderer("menu:copy-line-down"),
        },
        {
          label: "Move Line Up",
          accelerator: "Alt+Up",
          click: () => sendToRenderer("menu:move-line-up"),
        },
        {
          label: "Move Line Down",
          accelerator: "Alt+Down",
          click: () => sendToRenderer("menu:move-line-down"),
        },
      ],
    },

    // ── View ──────────────────────────────────────────────────────────────
    {
      label: "View",
      submenu: [
        {
          label: "Command Palette...",
          accelerator: "Cmd+Shift+P",
          click: () => sendToRenderer("menu:command-palette"),
        },
        { type: "separator" },
        {
          label: "Explorer",
          accelerator: "Cmd+Shift+E",
          click: () => sendToRenderer("menu:navigate", "/files"),
        },
        {
          label: "Source Control",
          accelerator: "Cmd+Shift+G",
          click: () => sendToRenderer("menu:navigate", "/source-control"),
        },
        {
          label: "Agents",
          accelerator: "Cmd+Shift+A",
          click: () => sendToRenderer("menu:navigate", "/agents"),
        },
        { type: "separator" },
        {
          label: "Toggle Activity Bar",
          click: () => sendToRenderer("menu:toggle-activity-bar"),
        },
        {
          label: "Toggle Sidebar",
          accelerator: "Cmd+B",
          click: () => sendToRenderer("menu:toggle-sidebar"),
        },
        {
          label: "Toggle Terminal",
          accelerator: "Cmd+`",
          click: () => sendToRenderer("menu:toggle-terminal"),
        },
        { type: "separator" },
        {
          label: "Zoom In",
          accelerator: "Cmd+=",
          role: "zoomIn",
        },
        {
          label: "Zoom Out",
          accelerator: "Cmd+-",
          role: "zoomOut",
        },
        {
          label: "Reset Zoom",
          accelerator: "Cmd+0",
          role: "resetZoom",
        },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toggle Full Screen", accelerator: "Ctrl+Cmd+F" },
      ],
    },

    // ── Go ────────────────────────────────────────────────────────────────
    {
      label: "Go",
      submenu: [
        {
          label: "Back",
          accelerator: "Ctrl+-",
          click: () => win?.webContents.goBack(),
        },
        {
          label: "Forward",
          accelerator: "Ctrl+Shift+-",
          click: () => win?.webContents.goForward(),
        },
        { type: "separator" },
        {
          label: "Go to File...",
          accelerator: "Cmd+P",
          click: () => sendToRenderer("menu:go-to-file"),
        },
        {
          label: "Go to Symbol...",
          accelerator: "Cmd+Shift+O",
          click: () => sendToRenderer("menu:go-to-symbol"),
        },
        {
          label: "Go to Line...",
          accelerator: "Ctrl+G",
          click: () => sendToRenderer("menu:go-to-line"),
        },
      ],
    },

    // ── Run ───────────────────────────────────────────────────────────────
    {
      label: "Run",
      submenu: [
        {
          label: "Start Agent",
          accelerator: "Cmd+Shift+D",
          click: () => sendToRenderer("menu:start-agent"),
        },
        {
          label: "Stop Agent",
          accelerator: "Cmd+Shift+F5",
          click: () => sendToRenderer("menu:stop-agent"),
        },
        { type: "separator" },
        {
          label: "Run Scan",
          accelerator: "Cmd+Shift+B",
          click: () => sendToRenderer("menu:run-scan"),
        },
      ],
    },

    // ── Terminal ──────────────────────────────────────────────────────────
    {
      label: "Terminal",
      submenu: [
        {
          label: "New Terminal",
          accelerator: "Ctrl+`",
          click: () => sendToRenderer("menu:new-terminal"),
        },
        {
          label: "Split Terminal",
          accelerator: "Cmd+\\",
          click: () => sendToRenderer("menu:split-terminal"),
        },
        { type: "separator" },
        {
          label: "Kill Active Terminal",
          click: () => sendToRenderer("menu:kill-terminal"),
        },
        {
          label: "Kill All Terminals",
          click: () => sendToRenderer("menu:kill-all-terminals"),
        },
        { type: "separator" },
        {
          label: "Clear Terminal",
          click: () => sendToRenderer("menu:clear-terminal"),
        },
      ],
    },

    // ── Window ────────────────────────────────────────────────────────────
    {
      label: "Window",
      submenu: [
        { role: "minimize", accelerator: "Cmd+M" },
        { role: "zoom" },
        { type: "separator" },
        { role: "close", label: "Close Window", accelerator: "Cmd+W" },
        { type: "separator" },
        { role: "front" },
      ],
    },

    // ── Help ──────────────────────────────────────────────────────────────
    {
      label: "Help",
      submenu: [
        {
          label: "hashmark Documentation",
          click: () => shell.openExternal("https://hashmark.md/docs"),
        },
        { type: "separator" },
        {
          label: "Report Issue",
          click: () => shell.openExternal("https://github.com/hashmark/hashmark/issues"),
        },
        { type: "separator" },
        {
          label: "Check for Updates...",
          click: async () => {
            try {
              const { autoUpdater } = await import("electron-updater");
              autoUpdater.checkForUpdates();
            } catch {
              dialog.showMessageBox({ message: "Auto-updater not configured.", type: "info" });
            }
          },
        },
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: "Cmd+Option+I",
          click: () => win?.webContents.toggleDevTools(),
        },
        {
          label: "Reload Window",
          accelerator: "Cmd+Shift+R",
          click: () => win?.webContents.reload(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Set the app name so macOS menu shows "hashmark studio" instead of "Electron"
app.setName("hashmark studio");

app.whenReady().then(() => {
  // Set dock icon on macOS
  if (process.platform === "darwin") {
    const iconPath = resolve(__dirname, "../../assets/icon.png");
    if (existsSync(iconPath)) {
      app.dock?.setIcon(nativeImage.createFromPath(iconPath));
    }
  }
  buildMenu();
  createWindow();

  // Check for updates in production
  if (!isDev) {
    import("electron-updater").then(({ autoUpdater }) => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }).catch(() => {
      // electron-updater not installed -- skip auto-update
    });
  }
});

app.on("before-quit", () => {
  // Graceful shutdown: kill all child processes (PTY sessions) before Electron
  // tears down the Node environment. Without this, node-pty's ThreadSafeFunction
  // callback throws SIGABRT during Environment::CleanupHandles().
  try {
    const { execFileSync } = require("child_process") as typeof import("child_process");
    // Kill child processes of the current process (terminals, claude CLI)
    execFileSync("pkill", ["-P", String(process.pid)], { stdio: "ignore" });
  } catch {}
  try { server.close(); } catch {}
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
  return config.recent.map(dir => ({
    name: dir.split("/").pop() || dir,
    dir,
    lastOpened: Date.now(),
  }));
});
