use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: u64 = 16 * 1024 * 1024;
const RECENT_LIMIT: usize = 12;
static NEXT_TOKEN: AtomicU32 = AtomicU32::new(1);
#[derive(Default)]
pub struct IssuedDocuments(Mutex<VecDeque<(u32, PathBuf)>>);
static RECENTS_LOCK: Mutex<()> = Mutex::new(());
type Pending = Mutex<VecDeque<PathBuf>>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    name: String,
    format: &'static str,
    content: Option<String>,
    recent_token: Option<u32>,
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
        recent_token: None,
    })
}

fn open(app: &tauri::AppHandle, path: PathBuf) -> Option<Document> {
    let mut document = read(path.clone())?;
    if document.format == "source" && document.content.is_some() {
        let issued = app.state::<IssuedDocuments>();
        let mut issued = issued.0.lock().ok()?;
        let token = NEXT_TOKEN.fetch_add(1, Ordering::Relaxed);
        issued.truncate(RECENT_LIMIT - 1);
        issued.push_front((token, path));
        document.recent_token = Some(token);
    }
    Some(document)
}

#[derive(Serialize, Deserialize)]
struct RecentDocument {
    path: PathBuf,
    title: String,
}
#[derive(Serialize)]
pub struct RecentLabel {
    pub title: String,
    file: String,
}
fn recent_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("recent-documents.json"))
        .map_err(|_| "storageFailed".into())
}
fn read_recent(path: &Path) -> Result<Vec<RecentDocument>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("storageFailed".into()),
    };
    let mut data = Vec::new();
    file.take(256 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(|_| "storageFailed")?;
    if data.len() > 256 * 1024 {
        return Err("storageFailed".into());
    }
    let mut recent: Vec<RecentDocument> =
        serde_json::from_slice(&data).map_err(|_| "storageFailed")?;
    recent.retain(|entry| entry.path.is_absolute() && format(&entry.path) == Some("source"));
    recent.truncate(RECENT_LIMIT);
    Ok(recent)
}
fn write_recent(path: &Path, recent: &[RecentDocument]) -> Result<(), String> {
    let dir = path.parent().ok_or("storageFailed")?;
    std::fs::create_dir_all(dir).map_err(|_| "storageFailed")?;
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|_| "storageFailed")?;
    temp.write_all(&serde_json::to_vec(recent).map_err(|_| "storageFailed")?)
        .map_err(|_| "storageFailed")?;
    temp.persist(path).map_err(|_| "storageFailed")?;
    Ok(())
}

#[tauri::command]
pub fn recent_documents(app: tauri::AppHandle) -> Result<Vec<RecentLabel>, String> {
    let _lock = RECENTS_LOCK.lock().map_err(|_| "storageFailed")?;
    Ok(read_recent(&recent_path(&app)?)?
        .into_iter()
        .map(|entry| RecentLabel {
            title: entry.title,
            file: entry
                .path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        })
        .collect())
}

#[tauri::command]
pub fn remember_document(app: tauri::AppHandle, token: u32, title: String) -> Result<(), String> {
    let path = {
        let issued = app.state::<IssuedDocuments>();
        let mut issued = issued.0.lock().map_err(|_| "storageFailed")?;
        let index = issued
            .iter()
            .position(|(id, _)| *id == token)
            .ok_or("recentMissing")?;
        issued.remove(index).ok_or("recentMissing")?.1
    };
    let store = recent_path(&app)?;
    let _lock = RECENTS_LOCK.lock().map_err(|_| "storageFailed")?;
    let mut recent = read_recent(&store)?;
    recent.retain(|entry| entry.path != path);
    recent.insert(
        0,
        RecentDocument {
            path,
            title: title.chars().take(250).collect(),
        },
    );
    recent.truncate(RECENT_LIMIT);
    write_recent(&store, &recent)
}

#[tauri::command]
pub fn clear_recent_documents(app: tauri::AppHandle) -> Result<(), String> {
    let _lock = RECENTS_LOCK.lock().map_err(|_| "storageFailed")?;
    write_recent(&recent_path(&app)?, &[])
}

#[tauri::command]
pub async fn open_recent_document(app: tauri::AppHandle, index: usize) -> Result<Document, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = {
            let _lock = RECENTS_LOCK.lock().map_err(|_| "storageFailed")?;
            read_recent(&recent_path(&app)?)?
                .into_iter()
                .nth(index)
                .ok_or("recentMissing")?
                .path
        };
        open(&app, path)
            .filter(|document| document.content.is_some())
            .ok_or_else(|| "recentMissing".into())
    })
    .await
    .map_err(|_| "recentMissing".to_string())?
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
    tauri::async_runtime::spawn_blocking(move || path.and_then(|path| open(&app, path)))
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
                .and_then(|path| open(&app, path))
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
