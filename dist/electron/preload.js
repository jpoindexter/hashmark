// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("studio", {
  showInFinder: (path) => ipcRenderer.invoke("show-in-finder", path),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  platform: process.platform
});
