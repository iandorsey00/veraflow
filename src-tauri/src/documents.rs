use serde::Serialize;
use std::{
    collections::VecDeque,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: u64 = 16 * 1024 * 1024;
type Pending = Mutex<VecDeque<PathBuf>>;

#[derive(Serialize)]
pub struct Document {
    name: String,
    format: &'static str,
    content: Option<String>,
}

fn format(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "veraflow" | "vf" => Some("source"),
        "csv" => Some("csv"),
        _ => None,
    }
}

fn read(path: PathBuf) -> Option<Document> {
    let format = format(&path)?;
    let file_name = path.file_name()?.to_string_lossy();
    let content = (|| {
        if !path.is_file() {
            return None;
        }
        let file = File::open(&path).ok()?;
        let metadata = file.metadata().ok()?;
        if !metadata.is_file() || metadata.len() > MAX_BYTES {
            return None;
        }
        let mut text = String::new();
        let size = file.take(MAX_BYTES + 1).read_to_string(&mut text).ok()? as u64;
        (size <= MAX_BYTES).then_some(text)
    })();
    Some(Document {
        name: file_name.into_owned(),
        format,
        content,
    })
}

pub fn enqueue(app: &tauri::AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let state = app.state::<Pending>();
    let mut pending = state.lock().expect("document queue");
    let count = pending.len();
    for path in paths {
        if pending.len() >= 32 {
            break;
        }
        if format(&path).is_some() {
            pending.push_back(path);
        }
    }
    if count == pending.len() {
        return;
    }
    drop(pending);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("document-open", ());
    }
}

pub fn arguments<A: AsRef<std::ffi::OsStr>>(
    args: impl IntoIterator<Item = A>,
    cwd: PathBuf,
) -> impl Iterator<Item = PathBuf> {
    args.into_iter()
        .skip(1)
        .map(move |arg| cwd.join(arg.as_ref()))
}

#[tauri::command]
pub async fn take_document(app: tauri::AppHandle) -> Result<Option<Document>, String> {
    let path = app
        .state::<Pending>()
        .lock()
        .map_err(|_| "invalidImport")?
        .pop_front();
    tauri::async_runtime::spawn_blocking(move || path.and_then(read))
        .await
        .map_err(|_| "invalidImport".to_string())
}

#[tauri::command]
pub async fn pick_document(
    app: tauri::AppHandle,
    template_only: bool,
) -> Result<Option<Document>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let extensions: &[&str] = if template_only {
            &["veraflow", "vf"]
        } else {
            &["veraflow", "vf", "csv"]
        };
        let result = app
            .dialog()
            .file()
            .add_filter("VeraFlow documents", extensions)
            .blocking_pick_file();
        match result {
            None => Ok(None),
            Some(file) => file
                .into_path()
                .ok()
                .and_then(read)
                .map(Some)
                .ok_or_else(|| "invalidImport".to_string()),
        }
    })
    .await
    .map_err(|_| "invalidImport".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_supported_utf8_documents() {
        let dir = tempfile::tempdir().unwrap();
        let template = dir.path().join("return label.VF");
        std::fs::write(&template, "核流 {{name}}").unwrap();
        let opened = read(template).unwrap();
        assert_eq!(opened.format, "source");
        assert_eq!(opened.name, "return label.VF");
        assert_eq!(opened.content.as_deref(), Some("核流 {{name}}"));
        assert!(read(dir.path().join("settings.json")).is_none());
        let invalid = dir.path().join("invalid.csv");
        std::fs::write(&invalid, [0xff]).unwrap();
        assert!(read(invalid).unwrap().content.is_none());
        let large = dir.path().join("large.csv");
        File::create(&large)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(read(large).unwrap().content.is_none());
    }
}
