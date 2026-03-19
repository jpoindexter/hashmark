/**
 * Electron preload — exposes safe IPC to renderer
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studio", {
  showInFinder: (path: string) => ipcRenderer.invoke("show-in-finder", path),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  getProjectDir: () => ipcRenderer.invoke("get-project-dir"),
  setProjectDir: (dir: string) => ipcRenderer.invoke("set-project-dir", dir),
  getRecentProjects: () => ipcRenderer.invoke("get-recent-projects"),
  // Menu event subscriptions -- returns an unsubscribe function
  onMenu: (channel: string, handler: (...args: unknown[]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  // Auto-updater
  onUpdateAvailable: (handler: (info: { version: string }) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, info: { version: string }) => handler(info);
    ipcRenderer.on("update:available", wrapped);
    return () => ipcRenderer.removeListener("update:available", wrapped);
  },
  onUpdateDownloaded: (handler: (info: { version: string }) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, info: { version: string }) => handler(info);
    ipcRenderer.on("update:downloaded", wrapped);
    return () => ipcRenderer.removeListener("update:downloaded", wrapped);
  },
  installUpdate: () => ipcRenderer.invoke("install-update"),
});
