use tauri_plugin_fs::FsExt;

/// Erweitert den fs-Scope zur Laufzeit um einen vom Nutzer via Dialog
/// gewählten Ordner (Textur-Hot-Reload-Watcher, siehe hot_reload.js).
///
/// WICHTIG: Anders als die Browser File System Access API gewährt Tauris
/// dialog-Plugin KEINEN automatischen fs-Zugriff auf den ausgewählten
/// Pfad. Das Frontend muss diesen Command nach jeder Ordnerauswahl
/// aufrufen, BEVOR es @tauri-apps/plugin-fs (readDir/watch/...) auf
/// diesem Pfad verwendet — sonst schlägt der Zugriff mit einer
/// "not allowed"-Fehlermeldung fehl.
///
/// Details und offene Punkte: siehe TAURI_INTEGRATION_NOTES.md.
#[tauri::command]
fn grant_folder_access(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }

    // true = rekursiv, damit auch Unterordner (z. B. mdl/ neben Texturen)
    // ohne separaten Grant zugreifbar sind.
    app_handle
        .fs_scope()
        .allow_directory(&path_buf, true)
        .map_err(|err| err.to_string())?;

    Ok(())
}

/// Erweitert den fs-Scope um einzelne, per natives Tauri-Drag&Drop
/// abgelegte Dateipfade (siehe loader.js, _handleTauriDrop).
///
/// Anders als grant_folder_access (EIN Ordner, rekursiv) kann ein Drop
/// mehrere Dateien aus komplett unterschiedlichen, vorher nie freigegebenen
/// Verzeichnissen enthalten (z. B. MDL aus Ordner A + Textur aus Ordner B).
/// Deshalb hier: pro Pfad einzeln freigeben, nicht rekursiv (Least
/// Privilege — nur exakt die gedroppten Dateien, nicht ihre Elternordner).
///
/// BEWUSST NACHSICHTIG: Einzelne ungültige/nicht mehr existierende Pfade
/// brechen NICHT den gesamten Aufruf ab (kein früher `?`-Return in der
/// Schleife) — sonst würde ein einziger stale Pfad in einem Multi-File-Drop
/// das Laden aller anderen, gültigen Dateien verhindern. Nicht-lesbare
/// Pfade fallen später beim tatsächlichen readFile() ohnehin sauber mit
/// Fehlermeldung pro Datei auf.
///
/// Ordner in der Liste (z. B. falls der Nutzer versehentlich einen Ordner
/// mitdroppt) werden nicht-rekursiv freigegeben, aber NICHT als Modelldatei
/// geladen — das Herausfiltern von Ordnern passiert im Frontend
/// (loader.js), da stat() dort ohnehin schon aufgerufen wird.
#[tauri::command]
fn grant_files_access(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let scope = app_handle.fs_scope();
    for p in &paths {
        let path_buf = std::path::PathBuf::from(p);
        if !path_buf.exists() {
            continue;
        }
        let _ = if path_buf.is_dir() {
            scope.allow_directory(&path_buf, false)
        } else {
            scope.allow_file(&path_buf)
        };
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            grant_folder_access,
            grant_files_access
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
