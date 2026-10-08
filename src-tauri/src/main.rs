#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod storage;
mod updater;
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
    fn vf_deliver(text: *const c_char, tab: c_int) -> c_int;
    fn vf_mouse_source(enabled: c_int) -> c_int;
    fn vf_focus_source() -> c_int;
    fn vf_free(text: *mut c_char);
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
#[tauri::command]
async fn deliver_email(text: Option<String>, tab: bool) -> Result<(), String> {
    if text.as_ref().is_some_and(|v| v.len() > 4 * 1024 * 1024) {
        return Err("invalidText".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = CLIPBOARD_LOCK
            .try_lock()
            .map_err(|_| "clipboardBusy".to_string())?;
        let text = text
            .map(CString::new)
            .transpose()
            .map_err(|_| "invalidText".to_string())?;
        let result = unsafe {
            vf_deliver(
                text.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()),
                tab as i32,
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
fn set_tray_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    build_menu(&app, language == "zh-CN")
}
fn build_menu(app: &tauri::AppHandle, zh: bool) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem};
    let labels = if zh {
        ["新建会话", "模板", "当前会话", "设置", "退出"]
    } else {
        [
            "New session",
            "Templates",
            "Current session",
            "Settings",
            "Quit",
        ]
    };
    let ids = ["new", "templates", "session", "settings", "quit"];
    let items: Vec<_> = ids
        .iter()
        .zip(labels)
        .map(|(id, label)| MenuItem::with_id(app, *id, label, true, None::<&str>))
        .collect::<Result<_, _>>()
        .map_err(|_| "trayFailed")?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = items
        .iter()
        .map(|x| x as &dyn tauri::menu::IsMenuItem<_>)
        .collect();
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
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
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
        .invoke_handler(tauri::generate_handler![
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
            load_library,
            save_library,
            set_session_active,
            quit_app,
            set_tray_language
        ])
        .setup(|app| {
            let mut pixels = vec![0u8; 32 * 32 * 4];
            for y in 4..28 {
                for x in 4..28 {
                    if x == 7
                        || x == 8
                        || y == 23
                        || y == 24
                        || (x > 10 && x < 25 && (y == 8 || y == 9 || y == 15 || y == 16))
                    {
                        let i = (y * 32 + x) * 4;
                        pixels[i + 3] = 255;
                    }
                }
            }
            tauri::tray::TrayIconBuilder::with_id("main")
                .icon(tauri::image::Image::new_owned(pixels, 32, 32))
                .icon_as_template(true)
                .tooltip("VeraFlow 核流")
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                    let _ = app.emit("tray-action", id);
                })
                .build(app)?;
            build_menu(app.handle(), false).map_err(std::io::Error::other)?;
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
async fn export_templates(app: tauri::AppHandle, json: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    if json.len() > 16 * 1024 * 1024 {
        return Err("invalidImport".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
            .set_file_name("veraflow-templates.json")
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
async fn import_templates(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
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
