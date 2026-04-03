/**
 * Tauri IPC bridge — sets window.studio for native desktop capabilities.
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

  // Dev mode: project saved but server can't switch. Notify user.
  listen("studio:project-saved", () => {
    window.dispatchEvent(new CustomEvent("studio:toast", {
      detail: { type: "success", message: "Project saved. Run tauri:dev from that folder to switch." },
    }));
  }).catch(() => {});

  // Handle "Open Project..." from the native File menu.
  listen("menu:open-project", () => {
    invoke<string | null>("pick_folder")
      .then((dir) => {
        if (dir) return invoke("set_project_dir", { dir });
      })
      .catch((err) => console.error("[tauri] open-project failed:", err));
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
