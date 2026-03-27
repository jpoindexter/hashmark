/**
 * Tauri IPC bridge — sets window.studio with the same API as the Electron preload.
 * Only activates when running inside a Tauri webview (__TAURI_INTERNALS__ present).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Wrap an async listen() call so callers can return a sync unsubscribe function. */
function lazyUnsub(p: Promise<UnlistenFn>): () => void {
  let fn: UnlistenFn | null = null;
  p.then((unlisten) => {
    fn = unlisten;
  }).catch(() => {});
  return () => fn?.();
}

export function initTauriBridge(): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return;
  }

  // Rust emits "studio:reload" instead of calling window.location.reload() directly.
  listen("studio:reload", () => {
    window.location.reload();
  }).catch(() => {});

  // Handle "Open Project..." from the native File menu.
  // Rust emits this event; the bridge shows the folder picker and persists the choice.
  listen("menu:open-project", () => {
    invoke<string | null>("pick_folder")
      .then((dir) => {
        if (dir) return invoke("set_project_dir", { dir });
      })
      .catch(() => {});
  }).catch(() => {});

  window.studio = {
    platform: "darwin",

    showInFinder(path: string) {
      return invoke("show_in_finder", { path });
    },

    openExternal(url: string) {
      return invoke("open_external", { url });
    },

    pickFolder() {
      return invoke<string | null>("pick_folder");
    },

    getProjectDir() {
      return invoke<string | null>("get_project_dir");
    },

    setProjectDir(dir: string) {
      return invoke<boolean>("set_project_dir", { dir });
    },

    getRecentProjects() {
      return invoke<Array<{ name: string; dir: string; lastOpened: number }>>(
        "get_recent_projects",
      );
    },

    setDockBadge(count: string) {
      return invoke("set_dock_badge", { count });
    },

    onMenu(channel: string, handler: (...args: unknown[]) => void) {
      return lazyUnsub(
        listen(channel, (event) => {
          handler(event.payload as unknown);
        }),
      );
    },

    onWindowFocus(handler: () => void) {
      return lazyUnsub(listen("window:focus", () => handler()));
    },

    // Auto-updater not wired in Tauri yet — stubs prevent runtime errors.
    onUpdateAvailable(_handler: (info: { version: string }) => void) {
      return () => {};
    },
    onUpdateDownloaded(_handler: (info: { version: string }) => void) {
      return () => {};
    },
    async installUpdate() {},
  };
}
