#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod documents;
mod output_history;
mod storage;
mod updater;
mod workspace;
use std::{
    ffi::{CStr, CString},
    io::Write,
    os::raw::{c_char, c_int},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use storage::Library;
use tauri::{Emitter, Manager};
static CLIPBOARD_LOCK: Mutex<()> = Mutex::new(());
static STORE_LOCK: Mutex<()> = Mutex::new(());
static EXIT_GUARD: AtomicBool = AtomicBool::new(false);
static MINIMIZE: AtomicBool = AtomicBool::new(true);
unsafe extern "C" {
    fn vf_capture(restore: c_int, error: *mut c_int) -> *mut c_char;
    fn vf_read(error: *mut c_int) -> *mut c_char;
    fn vf_write(text: *const c_char) -> c_int;
    fn vf_delivery_target() -> usize;
    fn vf_deliver(text: *const c_char, keys: *const u8, count: usize, target: usize) -> c_int;
    fn vf_mouse_source(enabled: c_int) -> c_int;
    fn vf_focus_source() -> c_int;
    fn vf_free(text: *mut c_char);
}
// Only the calling app window is accepted; no frontend-provided native handles.
#[tauri::command]
fn session_window(window: tauri::WebviewWindow, compact: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        unsafe extern "C" {
            fn vf_session_placement(handle: *mut std::ffi::c_void, compact: c_int) -> c_int;
        }
        static PLACEMENT_LOCK: Mutex<()> = Mutex::new(());
        let _guard = PLACEMENT_LOCK.lock().map_err(|_| "windowPlacement")?;
        let hwnd = window.hwnd().map_err(|_| "windowPlacement")?;
        if unsafe { vf_session_placement(hwnd.0, compact as c_int) } == 0 {
            return Err("windowPlacement".into());
        }
        Ok(true)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, compact);
        Ok(false)
    }
}
fn error_code(code: i32) -> String {
    match code {
        1 => "emptySelection",
        2 => "sourceFocus",
        3 => "accessibility",
        4 => "clipboardUnsafe",
        5 => "copyTimeout",
        6 => "clipboardChanged",
        7 => "restoreFailed",
        9 => "invalidText",
        10 => "modifiersHeld",
        _ => "clipboardBusy",
    }
    .into()
}
fn take_text(ptr: *mut c_char, error: i32) -> Result<String, String> {
    if ptr.is_null() {
        return Err(error_code(error));
    }
    let result = unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map(str::to_owned)
            .map_err(|_| "invalidText".to_string())
    };
    unsafe { vf_free(ptr) };
    result
}
// Fixed destination only: the webview cannot launch arbitrary commands or URLs.
#[tauri::command]
fn open_repository() -> Result<(), String> {
    open_fixed_url("https://github.com/iandorsey00/veraflow")
}
fn open_fixed_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("/usr/bin/open").arg(url).spawn();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer.exe").arg(url).spawn();
    result
        .map(|mut child| {
            // Reap the OS launcher without blocking the UI.
            let _ = std::thread::spawn(move || {
                let _ = child.wait();
            });
        })
        .map_err(|_| "repositoryFailed".to_string())
}

#[tauri::command]
fn validate_shortcuts(shortcuts: Vec<String>) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    for (index, text) in shortcuts.into_iter().enumerate() {
        let shortcut = text
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .map_err(|_| format!("shortcutFailed:{index}"))?;
        if !ids.insert(shortcut.id()) {
            return Err(format!("shortcutFailed:{index}"));
        }
    }
    Ok(())
}

#[tauri::command]
async fn mouse_source(enabled: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = CLIPBOARD_LOCK
            .lock()
            .map_err(|_| "clipboardBusy".to_string())?;
        Ok(unsafe { vf_mouse_source(enabled as i32) } != 0)
    })
    .await
    .map_err(|_| "captureFailed".to_string())?
}
#[tauri::command]
async fn mouse_transfer(restore: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = CLIPBOARD_LOCK
            .try_lock()
            .map_err(|_| "clipboardBusy".to_string())?;
        let focused = unsafe { vf_focus_source() };
        if focused != 0 {
            return Err(error_code(focused));
        }
        let mut error = 0;
        let ptr = unsafe { vf_capture(restore as i32, &mut error) };
        take_text(ptr, error)
    })
    .await
    .map_err(|_| "captureFailed".to_string())?
}
#[tauri::command]
async fn capture_selection(restore: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = CLIPBOARD_LOCK
            .try_lock()
            .map_err(|_| "clipboardBusy".to_string())?;
        let mut error = 0;
        let ptr = unsafe { vf_capture(restore as i32, &mut error) };
        take_text(ptr, error)
    })
    .await
    .map_err(|_| "captureFailed".to_string())?
}
#[tauri::command]
async fn read_clipboard() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let _lock = CLIPBOARD_LOCK
            .try_lock()
            .map_err(|_| "clipboardBusy".to_string())?;
        let mut error = 0;
        let ptr = unsafe { vf_read(&mut error) };
        take_text(ptr, error)
    })
    .await
    .map_err(|_| "captureFailed".to_string())?
}
#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    let _lock = CLIPBOARD_LOCK
        .try_lock()
        .map_err(|_| "clipboardBusy".to_string())?;
    let text = CString::new(text).map_err(|_| "invalidText".to_string())?;
    if unsafe { vf_write(text.as_ptr()) } != 0 {
        return Err("clipboardBusy".into());
    }
    Ok(())
}
#[derive(serde::Deserialize)]
enum NavigationKey {
    Tab,
    #[serde(rename = "Shift+Tab")]
    ShiftTab,
}

#[tauri::command]
fn delivery_target() -> Result<String, String> {
    let target = unsafe { vf_delivery_target() };
    if target == 0 {
        return Err("sourceFocus".into());
    }
    Ok(target.to_string())
}

#[tauri::command]
async fn deliver_email(
    text: Option<String>,
    tab: bool,
    navigation: Option<Vec<NavigationKey>>,
    target: Option<String>,
    restore_source: Option<bool>,
) -> Result<(), String> {
    if text.as_ref().is_some_and(|v| v.len() > 4 * 1024 * 1024) {
        return Err("invalidText".into());
    }
    let navigation = navigation.unwrap_or_else(|| {
        if tab {
            vec![NavigationKey::Tab]
        } else {
            Vec::new()
        }
    });
    if navigation.len() > 16 || (text.is_none() && !navigation.is_empty()) {
        return Err("invalidSource".into());
    }
    let keys: Vec<u8> = navigation
        .into_iter()
        .map(|key| match key {
            NavigationKey::Tab => 0,
            NavigationKey::ShiftTab => 1,
        })
        .collect();
    let target = match target {
        Some(value) => value
            .parse::<usize>()
            .ok()
            .filter(|id| *id != 0)
            .ok_or("sourceFocus")?,
        None => 0,
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = CLIPBOARD_LOCK
            .try_lock()
            .map_err(|_| "clipboardBusy".to_string())?;
        if restore_source.unwrap_or(false) {
            let focused = unsafe { vf_focus_source() };
            if focused != 0 {
                return Err(error_code(focused));
            }
        }
        let text = text
            .map(CString::new)
            .transpose()
            .map_err(|_| "invalidText".to_string())?;
        let result = unsafe {
            vf_deliver(
                text.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()),
                keys.as_ptr(),
                keys.len(),
                target,
            )
        };
        if result == 0 {
            Ok(())
        } else {
            Err(match result {
                2 | 3 | 8 | 10 => error_code(result),
                _ => "emailPasteFailed".to_string(),
            })
        }
    })
    .await
    .map_err(|_| "emailPasteFailed".to_string())?
}
fn data_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("library.json"))
        .map_err(|_| "storageFailed".into())
}
#[tauri::command]
fn load_library(app: tauri::AppHandle) -> Result<Option<Library>, String> {
    let _lock = STORE_LOCK.lock().map_err(|_| "storageFailed".to_string())?;
    let path = data_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    if std::fs::metadata(&path).map_err(|_| "storageFailed")?.len() > 16 * 1024 * 1024 {
        return Err("invalidLibrary".into());
    }
    let data = std::fs::read(path).map_err(|_| "storageFailed")?;
    let library: Library = serde_json::from_slice(&data).map_err(|_| "invalidLibrary")?;
    library.validate()?;
    MINIMIZE.store(library.preferences.minimize_to_tray, Ordering::SeqCst);
    Ok(Some(library))
}
#[tauri::command]
fn save_library(app: tauri::AppHandle, library: Library) -> Result<(), String> {
    library.validate()?;
    let _lock = STORE_LOCK.lock().map_err(|_| "storageFailed".to_string())?;
    let path = data_path(&app)?;
    let dir = path.parent().ok_or("storageFailed")?;
    std::fs::create_dir_all(dir).map_err(|_| "storageFailed")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "storageFailed")?;
    }
    let bytes = serde_json::to_vec_pretty(&library).map_err(|_| "storageFailed")?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("invalidLibrary".into());
    }
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|_| "storageFailed")?;
    temp.write_all(&bytes).map_err(|_| "storageFailed")?;
    temp.as_file().sync_all().map_err(|_| "storageFailed")?;
    temp.persist(&path).map_err(|_| "storageFailed")?;
    MINIMIZE.store(library.preferences.minimize_to_tray, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
fn set_session_active(active: bool) {
    EXIT_GUARD.store(active, Ordering::SeqCst);
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    if updater::INSTALLING.load(Ordering::SeqCst) {
        return;
    }
    app.exit(0);
}
#[tauri::command]
fn set_tray_menu(
    app: tauri::AppHandle,
    language: String,
    update_available: bool,
) -> Result<(), String> {
    build_menu(&app, language == "zh-CN", update_available)
}
fn build_menu(app: &tauri::AppHandle, zh: bool, update_available: bool) -> Result<(), String> {
    use tauri::menu::{IsMenuItem, Menu, MenuItem, Submenu};
    let mut entries = if zh {
        vec![
            ("open", "打开文件…"),
            ("folder", "打开文件夹…"),
            ("session", "当前会话"),
            ("settings", "设置"),
        ]
    } else {
        vec![
            ("open", "Open file…"),
            ("folder", "Open folder…"),
            ("session", "Current session"),
            ("settings", "Settings"),
        ]
    };
    if update_available && !cfg!(feature = "test-build") {
        entries.push((
            "update",
            if zh {
                "更新应用…"
            } else {
                "Update app…"
            },
        ));
    }
    entries.insert(
        1,
        (
            "outputs",
            if zh {
                "最近的输出"
            } else {
                "Recent outputs"
            },
        ),
    );
    entries.push(("quit", if zh { "退出" } else { "Quit" }));
    let items: Vec<_> = entries
        .into_iter()
        .map(|(id, label)| MenuItem::with_id(app, id, label, true, None::<&str>))
        .collect::<Result<_, _>>()
        .map_err(|_| "trayFailed")?;
    let recent = documents::recent_documents(app.clone()).unwrap_or_default();
    let mut recent_items = vec![MenuItem::with_id(
        app,
        "recent",
        if zh {
            "显示最近打开的模板…"
        } else {
            "Show recent templates…"
        },
        true,
        None::<&str>,
    )
    .map_err(|_| "trayFailed")?];
    for (index, entry) in recent.into_iter().enumerate() {
        #[cfg(target_os = "windows")]
        let title = entry.title.replace('&', "&&");
        #[cfg(not(target_os = "windows"))]
        let title = entry.title;
        recent_items.push(
            MenuItem::with_id(app, format!("recent-{index}"), title, true, None::<&str>)
                .map_err(|_| "trayFailed")?,
        );
    }
    let recent_refs: Vec<&dyn IsMenuItem<_>> = recent_items
        .iter()
        .map(|item| item as &dyn IsMenuItem<_>)
        .collect();
    let recent_menu = Submenu::with_items(
        app,
        if zh {
            "最近打开的模板"
        } else {
            "Recently opened templates"
        },
        true,
        &recent_refs,
    )
    .map_err(|_| "trayFailed")?;
    let mut refs: Vec<&dyn IsMenuItem<_>> = items
        .iter()
        .map(|item| item as &dyn IsMenuItem<_>)
        .collect();
    refs.insert(1, &recent_menu);
    let menu = Menu::with_items(app, &refs).map_err(|_| "trayFailed")?;
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu)).map_err(|_| "trayFailed")?;
    }
    Ok(())
}
fn main() {
    let autostart = tauri_plugin_autostart::Builder::new();
    #[cfg(target_os = "macos")]
    let autostart = autostart.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            documents::enqueue(
                app,
                documents::arguments(args, std::path::PathBuf::from(cwd)),
            );
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(autostart.build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::PendingUpdate::default())
        .manage(documents::IssuedDocuments::default())
        .manage(documents::OpenFolder::default())
        .manage(Mutex::new(
            std::collections::VecDeque::<std::path::PathBuf>::new(),
        ))
        .invoke_handler(tauri::generate_handler![
            documents::take_document,
            documents::pick_document,
            documents::pick_template_folder,
            documents::open_folder_template,
            documents::refresh_template_folder,
            documents::recent_documents,
            documents::remember_document,
            documents::open_recent_document,
            documents::clear_recent_documents,
            output_history::list_outputs,
            output_history::read_output,
            output_history::record_output,
            output_history::trim_outputs,
            session_window,
            open_repository,
            updater::check_update,
            updater::install_update,
            export_templates,
            import_templates,
            validate_shortcuts,
            capture_selection,
            mouse_source,
            mouse_transfer,
            read_clipboard,
            write_clipboard,
            deliver_email,
            delivery_target,
            load_library,
            save_library,
            set_session_active,
            quit_app,
            set_tray_menu
        ])
        .setup(|app| {
            let tray = tauri::tray::TrayIconBuilder::with_id("main");
            let tray = if let Some(icon) = app.default_window_icon() {
                tray.icon(icon.clone())
            } else {
                tray
            };
            tray.tooltip("VeraFlow 核流")
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                    let _ = app.emit("tray-action", id);
                })
                .build(app)?;
            build_menu(app.handle(), false, false).map_err(std::io::Error::other)?;
            if let Ok(cwd) = std::env::current_dir() {
                documents::enqueue(app.handle(), documents::arguments(std::env::args_os(), cwd));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if MINIMIZE.load(Ordering::SeqCst) {
                    let _ = window.hide();
                } else {
                    let _ = window.emit("tray-action", "quit");
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Unable to initialize VeraFlow")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { ref urls } = event {
                documents::enqueue(app, urls.iter().filter_map(|url| url.to_file_path().ok()));
            }
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if updater::INSTALLING.load(Ordering::SeqCst) {
                    api.prevent_exit();
                } else if code.is_none() && EXIT_GUARD.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                    let _ = app.emit("tray-action", "quit");
                }
            }
        });
}

#[cfg(test)]
mod shortcut_tests {
    use super::validate_shortcuts;
    #[test]
    fn rejects_alias_duplicates_before_registration() {
        assert!(validate_shortcuts(vec!["Ctrl+Shift+A".into(), "Control+Shift+A".into()]).is_err());
        assert!(validate_shortcuts(vec![
            "CommandOrControl+Shift+1".into(),
            "CommandOrControl+Shift+2".into()
        ])
        .is_ok());
        assert!(validate_shortcuts(vec!["not-a-real-key".into()]).is_err());
    }
}

#[tauri::command]
async fn export_templates(
    app: tauri::AppHandle,
    json: String,
    filename: Option<String>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    if json.len() > 16 * 1024 * 1024 {
        return Err("invalidImport".into());
    }
    let filename = filename
        .filter(|name| {
            [
                "veraflow-templates.json",
                "veraflow-template.json",
                "veraflow-scanner.json",
                "veraflow-snippets.json",
                "veraflow-table.json",
                "veraflow-database.json",
                "template.veraflow",
                "prefilled-template.veraflow",
                "veraflow-output.txt",
            ]
            .contains(&name.as_str())
                || name.rsplit_once('.').is_some_and(|(stem, extension)| {
                    matches!(extension, "veraflow" | "json" | "txt")
                        && !stem.is_empty()
                        && stem.len() <= 280
                        && stem
                            .chars()
                            .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_'))
                })
        })
        .unwrap_or_else(|| "veraflow-templates.json".into());
    let (label, ext) = match filename.rsplit('.').next() {
        Some("veraflow") => ("VeraFlow template", "veraflow"),
        Some("txt") => ("Text", "txt"),
        _ => ("JSON", "json"),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter(label, &[ext])
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|_| "storageFailed")?;
        let dir = path.parent().ok_or("storageFailed")?;
        let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|_| "storageFailed")?;
        temp.write_all(json.as_bytes())
            .map_err(|_| "storageFailed")?;
        temp.as_file().sync_all().map_err(|_| "storageFailed")?;
        temp.persist(path).map_err(|_| "storageFailed")?;
        Ok(true)
    })
    .await
    .map_err(|_| "storageFailed".to_string())?
}
#[tauri::command]
async fn import_templates(
    app: tauri::AppHandle,
    csv: Option<bool>,
    source: Option<bool>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (label, extensions): (&str, &[&str]) = if source.unwrap_or(false) {
        ("VeraFlow template", &["veraflow", "vf", "txt"])
    } else if csv.unwrap_or(false) {
        ("CSV", &["csv"])
    } else {
        ("JSON", &["json"])
    };
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter(label, extensions)
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|_| "storageFailed")?;
        if std::fs::metadata(&path).map_err(|_| "storageFailed")?.len() > 16 * 1024 * 1024 {
            return Err("invalidImport".into());
        }
        std::fs::read_to_string(path)
            .map(Some)
            .map_err(|_| "invalidImport".into())
    })
    .await
    .map_err(|_| "storageFailed".to_string())?
}
