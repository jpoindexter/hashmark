/**
 * Electron preload — exposes safe IPC to renderer
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studio", {
  showInFinder: (path: string) => ipcRenderer.invoke("show-in-finder", path),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  platform: process.platform,
});
