use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct StudioConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    project_dir: Option<String>,
    #[serde(default)]
    recent: Vec<String>,
}

fn config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".hashmark").join("studio-config.json")
}

fn read_config() -> StudioConfig {
    let path = config_path();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str(&data) {
                return cfg;
            }
        }
    }
    StudioConfig::default()
}

fn write_config(cfg: &StudioConfig) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(path, json);
    }
}

fn add_to_recent(cfg: &mut StudioConfig, dir: &str) {
    cfg.recent.retain(|p| p != dir);
    cfg.recent.insert(0, dir.to_string());
    cfg.recent.truncate(10);
}

// ── State ─────────────────────────────────────────────────────────────────────

struct ProjectDir(Mutex<String>);

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Emit a Tauri event to the main webview window.
fn emit_to_main(app: &AppHandle, channel: &str, payload: impl Serialize + Clone) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit(channel, payload);
    }
}

/// Open a URL in the system default browser via the macOS `open` command.
fn open_url(url: &str) {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();
    #[cfg(not(target_os = "macos"))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

// ── IPC Commands ──────────────────────────────────────────────────────────────

/// Reveal path in Finder (macOS: `open -R /path`)
#[tauri::command]
fn show_in_finder(path: String) {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .args(["-R", &path])
        .spawn();
}

/// Open URL in the system default browser
#[tauri::command]
fn open_external(url: String) {
    open_url(&url);
}

/// Show OS folder-picker dialog; returns the chosen path or null
#[tauri::command]
fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Select Project Folder")
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

/// Return the active project directory (null if unset)
#[tauri::command]
fn get_project_dir(state: tauri::State<ProjectDir>) -> Option<String> {
    let dir = state.0.lock().unwrap().clone();
    if dir == "__unset__" { None } else { Some(dir) }
}

/// Persist a new project directory and signal the webview to reload
#[tauri::command]
fn set_project_dir(
    app: AppHandle,
    state: tauri::State<ProjectDir>,
    dir: String,
) -> bool {
    let mut cfg = read_config();
    add_to_recent(&mut cfg, &dir);
    cfg.project_dir = Some(dir.clone());
    write_config(&cfg);
    *state.0.lock().unwrap() = dir;
    emit_to_main(&app, "studio:reload", "");
    true
}

#[derive(Serialize)]
struct RecentProject {
    name: String,
    dir: String,
    #[serde(rename = "lastOpened")]
    last_opened: u64,
}

/// Return list of recently opened projects
#[tauri::command]
fn get_recent_projects() -> Vec<RecentProject> {
    let cfg = read_config();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    cfg.recent
        .into_iter()
        .map(|dir| {
            let name = dir.split('/').last().unwrap_or(&dir).to_string();
            RecentProject { name, dir, last_opened: now }
        })
        .collect()
}

/// Set macOS dock tile badge text (no-op until a Tauri dock plugin is wired in)
#[tauri::command]
#[allow(unused_variables)]
fn set_dock_badge(count: String) {}

// ── Menu ──────────────────────────────────────────────────────────────────────

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    // ── hashmark studio ──
    let app_menu = SubmenuBuilder::new(app, "hashmark studio")
        .item(&MenuItemBuilder::with_id("menu:about", "About hashmark studio").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:preferences", "Preferences...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Quit hashmark studio"))?)
        .build()?;

    // ── File ──
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("menu:new-session", "New Session")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:new-window", "New Window")
                .accelerator("CmdOrCtrl+Shift+N")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("menu:open-project", "Open Project...").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?)
        .build()?;

    // ── Edit ──
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:find", "Find")
                .accelerator("CmdOrCtrl+F")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:find-next", "Find Next")
                .accelerator("CmdOrCtrl+G")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:find-prev", "Find Previous")
                .accelerator("CmdOrCtrl+Shift+G")
                .build(app)?,
        )
        .build()?;

    // Selection menu removed — Alt-based accelerators intercept macOS system keys
    // (breaks screenshots, Finder, and other Option-key behaviors)

    // ── View ──
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("menu:command-palette", "Command Palette...")
                .accelerator("CmdOrCtrl+Shift+P")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:nav-files", "Explorer")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:nav-source-control", "Source Control")
                .accelerator("CmdOrCtrl+Shift+H")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:nav-agents", "Agents")
                .accelerator("CmdOrCtrl+Shift+A")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:toggle-activity-bar", "Toggle Activity Bar")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:toggle-sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+B")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:toggle-terminal", "Toggle Terminal")
                .accelerator("CmdOrCtrl+`")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:zoom-in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:zoom-out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:zoom-reset", "Reset Zoom")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    // ── Go ──
    let go_menu = SubmenuBuilder::new(app, "Go")
        .item(
            &MenuItemBuilder::with_id("menu:go-back", "Back")
                .accelerator("Ctrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:go-forward", "Forward")
                .accelerator("Ctrl+Shift+-")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:go-to-file", "Go to File...")
                .accelerator("CmdOrCtrl+P")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:go-to-symbol", "Go to Symbol...")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:go-to-line", "Go to Line...")
                .accelerator("Ctrl+G")
                .build(app)?,
        )
        .build()?;

    // ── Run ──
    let run_menu = SubmenuBuilder::new(app, "Run")
        .item(
            &MenuItemBuilder::with_id("menu:start-agent", "Start Agent")
                .accelerator("CmdOrCtrl+Shift+D")
                .build(app)?,
        )
        .item(&MenuItemBuilder::with_id("menu:stop-agent", "Stop Agent").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:run-scan", "Run Scan")
                .accelerator("CmdOrCtrl+Shift+B")
                .build(app)?,
        )
        .build()?;

    // ── Terminal ──
    let terminal_menu = SubmenuBuilder::new(app, "Terminal")
        .item(
            &MenuItemBuilder::with_id("menu:new-terminal", "New Terminal")
                .accelerator("Ctrl+`")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:split-terminal", "Split Terminal")
                .accelerator("CmdOrCtrl+\\")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:kill-terminal", "Kill Active Terminal").build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:kill-all-terminals", "Kill All Terminals")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("menu:clear-terminal", "Clear Terminal").build(app)?)
        .build()?;

    // ── Window ──
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?)
        .build()?;

    // ── Help ──
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("menu:docs", "hashmark Documentation").build(app)?)
        .item(&MenuItemBuilder::with_id("menu:changelog", "Release Notes").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("menu:report-issue", "Report Issue").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu:devtools", "Toggle Developer Tools")
                .accelerator("CmdOrCtrl+Alt+I")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("menu:reload-window", "Reload Window")
                .accelerator("CmdOrCtrl+Shift+R")
                .build(app)?,
        )
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&go_menu)
        .item(&run_menu)
        .item(&terminal_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}

// ── App entry point ───────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ProjectDir(Mutex::new({
            let cfg = read_config();
            cfg.project_dir.unwrap_or_else(|| "__unset__".to_string())
        })))
        .setup(|app| {
            let menu = build_menu(&app.handle())?;
            app.set_menu(menu)?;

            // Route menu events to the webview
            app.on_menu_event(|app, event| {
                let id = event.id().as_ref();
                match id {
                    "menu:about" => emit_to_main(app, "menu:about", ""),
                    "menu:preferences" => emit_to_main(app, "menu:navigate", "/settings"),
                    "menu:new-session" => emit_to_main(app, "menu:new-session", ""),
                    "menu:new-window" => {} // single-window for now
                    "menu:open-project" => emit_to_main(app, "menu:open-project", ""),
                    "menu:command-palette" => emit_to_main(app, "menu:command-palette", ""),
                    "menu:nav-files" => emit_to_main(app, "menu:navigate", "/files"),
                    "menu:nav-source-control" => {
                        emit_to_main(app, "menu:navigate", "/source-control")
                    }
                    "menu:nav-agents" => emit_to_main(app, "menu:navigate", "/agents"),
                    "menu:toggle-activity-bar" => {
                        emit_to_main(app, "menu:toggle-activity-bar", "")
                    }
                    "menu:toggle-sidebar" => emit_to_main(app, "menu:toggle-sidebar", ""),
                    "menu:toggle-terminal" => emit_to_main(app, "menu:toggle-terminal", ""),
                    "menu:zoom-in" => emit_to_main(app, "menu:zoom-in", ""),
                    "menu:zoom-out" => emit_to_main(app, "menu:zoom-out", ""),
                    "menu:zoom-reset" => emit_to_main(app, "menu:zoom-reset", ""),
                    "menu:go-back" => emit_to_main(app, "menu:go-back", ""),
                    "menu:go-forward" => emit_to_main(app, "menu:go-forward", ""),
                    "menu:go-to-file" => emit_to_main(app, "menu:go-to-file", ""),
                    "menu:go-to-symbol" => emit_to_main(app, "menu:go-to-symbol", ""),
                    "menu:go-to-line" => emit_to_main(app, "menu:go-to-line", ""),
                    "menu:start-agent" => emit_to_main(app, "menu:start-agent", ""),
                    "menu:stop-agent" => emit_to_main(app, "menu:stop-agent", ""),
                    "menu:run-scan" => emit_to_main(app, "menu:run-scan", ""),
                    "menu:new-terminal" => emit_to_main(app, "menu:new-terminal", ""),
                    "menu:split-terminal" => emit_to_main(app, "menu:split-terminal", ""),
                    "menu:kill-terminal" => emit_to_main(app, "menu:kill-terminal", ""),
                    "menu:kill-all-terminals" => {
                        emit_to_main(app, "menu:kill-all-terminals", "")
                    }
                    "menu:clear-terminal" => emit_to_main(app, "menu:clear-terminal", ""),
                    "menu:find" => emit_to_main(app, "menu:find", ""),
                    "menu:find-next" => emit_to_main(app, "menu:find-next", ""),
                    "menu:find-prev" => emit_to_main(app, "menu:find-prev", ""),
                    "menu:expand-selection" => emit_to_main(app, "menu:expand-selection", ""),
                    "menu:shrink-selection" => emit_to_main(app, "menu:shrink-selection", ""),
                    "menu:copy-line-up" => emit_to_main(app, "menu:copy-line-up", ""),
                    "menu:copy-line-down" => emit_to_main(app, "menu:copy-line-down", ""),
                    "menu:move-line-up" => emit_to_main(app, "menu:move-line-up", ""),
                    "menu:move-line-down" => emit_to_main(app, "menu:move-line-down", ""),
                    "menu:docs" => open_url("https://hashmark.md/docs"),
                    "menu:changelog" => open_url("https://hashmark.md/changelog"),
                    "menu:report-issue" => {
                        open_url("https://github.com/hashmark/hashmark/issues")
                    }
                    "menu:devtools" => {
                        if let Some(w) = app.get_webview_window("main") {
                            #[cfg(debug_assertions)]
                            w.open_devtools();
                        }
                    }
                    "menu:reload-window" => emit_to_main(app, "studio:reload", ""),
                    _ => {}
                }
            });

            // Window focus: notify renderer (dock badge cleared in set_dock_badge no-op)
            let focus_handle = app.handle().clone();
            if let Some(win) = app.get_webview_window("main") {
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(true) = event {
                        emit_to_main(&focus_handle, "window:focus", "");
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_in_finder,
            open_external,
            pick_folder,
            get_project_dir,
            set_project_dir,
            get_recent_projects,
            set_dock_badge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
