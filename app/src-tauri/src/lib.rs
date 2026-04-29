mod checkpoint;
mod commands;
mod compact;
mod db;
mod harness;
mod issues;
mod mcp;
mod mcp_oauth;
mod routines;
mod sessions;
mod store;
mod stream;
mod tools;

use commands::DbState;
use harness::AlwaysAllowState;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("hashmark.db");
            let conn = db::init(&db_path).expect("failed to init db");
            app.manage(DbState(Mutex::new(conn)));
            app.manage(harness::PendingApprovals::default());
            app.manage(AlwaysAllowState::default());

            let mcp_state = mcp::init_mcp(app.handle());
            app.manage(mcp_state);

            // If a directory path was passed as a CLI argument, emit it to the frontend
            let args: Vec<String> = std::env::args().collect();
            if let Some(path_arg) = args.get(1) {
                let p = std::path::Path::new(path_arg);
                if p.is_dir() {
                    let path_str = path_arg.clone();
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        handle.emit("open-project", path_str).ok();
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::create_session,
            commands::get_messages,
            commands::delete_session,
            commands::rename_session,
            commands::list_agents,
            commands::create_agent,
            commands::update_agent,
            commands::delete_agent,
            commands::list_providers,
            commands::list_ollama_models,
            commands::get_api_key,
            commands::set_api_key,
            commands::stream_message,
            commands::update_session,
            commands::approve_tool,
            commands::list_dir,
            commands::get_home_dir,
            commands::list_issues,
            commands::create_issue,
            commands::update_issue,
            commands::delete_issue,
            commands::move_issue,
            commands::fork_session,
            commands::list_routines,
            commands::create_routine,
            commands::delete_routine,
            commands::run_routine,
            commands::update_trust_level,
            commands::pin_session,
            commands::set_session_color,
            commands::read_file,
            commands::write_file,
            commands::create_dir,
            commands::search_messages,
            commands::list_mcp_servers,
            commands::add_mcp_server,
            commands::remove_mcp_server,
            commands::toggle_mcp_server,
            commands::test_mcp_server,
            commands::start_mcp_oauth,
            commands::rename_file,
            commands::delete_path,
            commands::get_git_info,
            commands::always_allow_tool,
            commands::revoke_tool_permission,
            commands::list_always_allowed,
            commands::revert_to_message,
            commands::start_claude_oauth,
            commands::pick_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
