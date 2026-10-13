/// Table Maker desktop shell. All logic lives in the web frontend; Rust only provides
/// the window plus native "Save as…" dialogs and file writing.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Table Maker");
}
