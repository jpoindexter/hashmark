"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("studio", {
  showInFinder: (path) => import_electron.ipcRenderer.invoke("show-in-finder", path),
  openExternal: (url) => import_electron.ipcRenderer.invoke("open-external", url),
  platform: process.platform,
  pickFolder: () => import_electron.ipcRenderer.invoke("pick-folder"),
  getProjectDir: () => import_electron.ipcRenderer.invoke("get-project-dir"),
  setProjectDir: (dir) => import_electron.ipcRenderer.invoke("set-project-dir", dir),
  getRecentProjects: () => import_electron.ipcRenderer.invoke("get-recent-projects"),
  // Menu event subscriptions — returns an unsubscribe function
  onMenu: (channel, handler) => {
    const wrapped = (_event, ...args) => handler(...args);
    import_electron.ipcRenderer.on(channel, wrapped);
    return () => import_electron.ipcRenderer.removeListener(channel, wrapped);
  }
});
