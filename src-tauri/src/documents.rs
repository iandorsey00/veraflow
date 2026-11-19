use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs::{File, OpenOptions},
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
pub const MAX_CSV_BYTES: u64 = 64 * 1024 * 1024;
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
    let limit = if format == "csv" {
        MAX_CSV_BYTES
    } else {
        MAX_BYTES
    };
    let content = (|| {
        if !path.is_file() {
            return None;
        }
        let file = File::open(&path).ok()?;
        let metadata = file.metadata().ok()?;
        if !metadata.is_file() || metadata.len() > limit {
            return None;
        }
        let mut text = String::new();
        let size = file.take(limit + 1).read_to_string(&mut text).ok()? as u64;
        (size <= limit).then_some(text)
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

fn declared_file(content: &str, key: &str) -> Option<String> {
    let mut lines = content.trim_start_matches('\u{feff}').lines();
    if lines.next()? != "--- veraflow 2" {
        return None;
    }
    let mut metadata = String::new();
    for line in lines {
        if line == "---" {
            let header: serde_json::Value = serde_json::from_str(&metadata).ok()?;
            return header[key]["file"].as_str().map(str::to_owned);
        }
        metadata.push_str(line);
        metadata.push('\n');
    }
    None
}

// Resolve only a relative CSV link from a template the user opened. Check containment
// after resolving links so a template cannot read an unrelated directory.
fn linked_csv_path(template: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.len() > 4096
        || relative.contains([':', '\\'])
        || relative
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || format(Path::new(relative)) != Some("csv")
    {
        return Err("csvLinkUnavailable".into());
    }
    let root = template
        .parent()
        .ok_or("csvLinkUnavailable")?
        .canonicalize()
        .map_err(|_| "csvLinkUnavailable")?;
    let target = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "csvLinkUnavailable")?;
    if !target.starts_with(&root) || format(&target) != Some("csv") || !target.is_file() {
        return Err("csvLinkUnavailable".into());
    }
    Ok(target)
}

#[tauri::command]
pub async fn read_linked_csv(
    app: tauri::AppHandle,
    token: u32,
    relative: String,
) -> Result<String, String> {
    let template = app
        .state::<IssuedDocuments>()
        .0
        .lock()
        .map_err(|_| "csvLinkUnavailable")?
        .iter()
        .find(|(id, _)| *id == token)
        .map(|(_, path)| path.clone())
        .ok_or("csvLinkUnavailable")?;
    tauri::async_runtime::spawn_blocking(move || {
        let source = read(template.clone())
            .and_then(|document| document.content)
            .ok_or("csvLinkUnavailable")?;
        if declared_file(&source, "csv").as_deref() != Some(relative.as_str()) {
            return Err("csvLinkUnavailable".into());
        }
        let path = linked_csv_path(&template, &relative)?;
        let file = File::open(path).map_err(|_| "csvLinkUnavailable")?;
        let metadata = file.metadata().map_err(|_| "csvLinkUnavailable")?;
        if !metadata.is_file() {
            return Err("csvLinkUnavailable".into());
        }
        if metadata.len() > MAX_CSV_BYTES {
            return Err("csvTooLarge".into());
        }
        let mut content = String::new();
        let bytes = file
            .take(MAX_CSV_BYTES + 1)
            .read_to_string(&mut content)
            .map_err(|_| "invalidCSV")? as u64;
        if bytes > MAX_CSV_BYTES {
            return Err("csvTooLarge".into());
        }
        Ok(content)
    })
    .await
    .map_err(|_| "csvLinkUnavailable".to_string())?
}

#[derive(Default)]
pub struct AppendDestination(Mutex<Option<AppendSnapshot>>);

struct AppendSnapshot {
    token: u32,
    path: PathBuf,
    content: String,
}

#[derive(Serialize)]
pub struct AppendPreview {
    token: u32,
    name: String,
    content: String,
}

fn append_snapshot(path: PathBuf) -> Result<AppendSnapshot, String> {
    let path = path.canonicalize().map_err(|_| "appendWriteFailed")?;
    if format(&path) != Some("csv") || !path.is_file() {
        return Err("invalidCSV".into());
    }
    let content = read(path.clone())
        .and_then(|document| document.content)
        .ok_or("appendReadFailed")?;
    Ok(AppendSnapshot {
        token: NEXT_TOKEN.fetch_add(1, Ordering::Relaxed),
        path,
        content,
    })
}

#[tauri::command]
pub async fn pick_append_csv(
    app: tauri::AppHandle,
    token: Option<u32>,
    relative: Option<String>,
) -> Result<Option<AppendPreview>, String> {
    let template = token.and_then(|id| {
        app.state::<IssuedDocuments>()
            .0
            .lock()
            .ok()?
            .iter()
            .find(|(token, _)| *token == id)
            .map(|(_, path)| path.clone())
    });
    tauri::async_runtime::spawn_blocking(move || {
        let path = if let (Some(template), Some(relative)) = (template, relative) {
            let source = read(template.clone())
                .and_then(|document| document.content)
                .ok_or("csvLinkUnavailable")?;
            if declared_file(&source, "append").as_deref() != Some(relative.as_str()) {
                return Err("csvLinkUnavailable".into());
            }
            linked_csv_path(&template, &relative)?
        } else {
            let Some(file) = app
                .dialog()
                .file()
                .add_filter("CSV", &["csv"])
                .blocking_pick_file()
            else {
                return Ok(None);
            };
            file.into_path().map_err(|_| "appendReadFailed")?
        };
        let snapshot = append_snapshot(path)?;
        let response = AppendPreview {
            token: snapshot.token,
            name: snapshot.path.to_string_lossy().into_owned(),
            content: snapshot.content.clone(),
        };
        *app.state::<AppendDestination>()
            .0
            .lock()
            .map_err(|_| "appendReadFailed")? = Some(snapshot);
        Ok(Some(response))
    })
    .await
    .map_err(|_| "appendReadFailed".to_string())?
}

fn append_write_error(_stage: &str, _error: impl std::fmt::Display) -> &'static str {
    #[cfg(test)]
    eprintln!("CSV append at {_stage}: {_error}");
    "appendWriteFailed"
}

fn commit_csv_append(snapshot: &mut AppendSnapshot, suffix: &str) -> Result<(), String> {
    let path = &snapshot.path;
    if suffix.is_empty()
        || suffix.contains('\0')
        || snapshot.content.len() as u64 + suffix.len() as u64 > MAX_CSV_BYTES
    {
        return Err("invalidCSV".into());
    }
    if !path.is_file() || path.canonicalize().ok().as_ref() != Some(path) {
        return Err("appendChanged".into());
    }
    let mut original = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| append_write_error("open", error))?;
    original
        .try_lock()
        .map_err(|error| append_write_error("lock", error))?;
    let permissions = original
        .metadata()
        .map_err(|error| append_write_error("permissions", error))?
        .permissions();
    let mut now = Vec::new();
    (&mut original)
        .take(MAX_CSV_BYTES + 1)
        .read_to_end(&mut now)
        .map_err(|error| append_write_error("read", error))?;
    if now != snapshot.content.as_bytes() {
        return Err("appendChanged".into());
    }
    let mut next = tempfile::NamedTempFile::new_in(path.parent().ok_or("appendWriteFailed")?)
        .map_err(|error| append_write_error("temporary file", error))?;
    next.write_all(&now)
        .and_then(|_| next.write_all(suffix.as_bytes()))
        .and_then(|_| next.as_file().set_permissions(permissions))
        .and_then(|_| next.as_file().sync_all())
        .map_err(|error| append_write_error("write and sync", error))?;
    // Windows can refuse a replacement while the destination has a locked handle.
    // Close our own handle before publishing the already-synced replacement.
    #[cfg(windows)]
    drop(original);
    // Keep the original intact if publishing the complete replacement fails.
    next.persist(path)
        .map_err(|error| append_write_error("replace", error))?;
    snapshot.content.push_str(suffix);
    Ok(())
}

#[tauri::command]
pub async fn append_csv_row(
    app: tauri::AppHandle,
    token: u32,
    suffix: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppendDestination>();
        let mut state = state.0.lock().map_err(|_| "appendWriteFailed")?;
        let snapshot = state
            .as_mut()
            .filter(|entry| entry.token == token)
            .ok_or("appendChanged")?;
        commit_csv_append(snapshot, &suffix)
    })
    .await
    .map_err(|_| "appendWriteFailed".to_string())?
}

#[tauri::command]
pub fn release_append_csv(app: tauri::AppHandle) {
    if let Ok(mut state) = app.state::<AppendDestination>().0.lock() {
        state.take();
    }
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
    // Consume a token issued by native file open. The frontend never supplies a path here.
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
    fn csv_append_preserves_the_file_and_refuses_stale_previews() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("records.csv");
        std::fs::write(&path, "\u{feff}ID,Name\r\n").unwrap();
        let mut snapshot = append_snapshot(path.clone()).unwrap();
        commit_csv_append(&mut snapshot, "1,Alex\r\n").unwrap();
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "\u{feff}ID,Name\r\n1,Alex\r\n"
        );
        std::fs::write(&path, "ID,Name\r\n1,Pat\r\n").unwrap();
        assert_eq!(
            commit_csv_append(&mut snapshot, "2,Drew\r\n").unwrap_err(),
            "appendChanged"
        );
        assert_eq!(
            std::fs::read_to_string(path).unwrap(),
            "ID,Name\r\n1,Pat\r\n"
        );
    }

    #[test]
    fn linked_csv_restricts_paths_to_the_opened_template_directory() {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("templates");
        std::fs::create_dir_all(folder.join("data")).unwrap();
        let template = folder.join("example.vf");
        let inside = folder.join("data/rows.csv");
        let outside = temp.path().join("outside.csv");
        std::fs::write(&inside, "Name\nAlex").unwrap();
        std::fs::write(&outside, "Name\nDrew").unwrap();
        assert_eq!(
            linked_csv_path(&template, "data/rows.csv").unwrap(),
            inside.canonicalize().unwrap()
        );
        assert!(linked_csv_path(&template, "../outside.csv").is_err());
        assert!(linked_csv_path(&template, outside.to_str().unwrap()).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(outside, folder.join("link.csv")).unwrap();
            assert!(linked_csv_path(&template, "link.csv").is_err());
        }
        assert_eq!(declared_file("--- veraflow 2\r\n{\"workflow\":\"csv\",\"csv\":{\"file\":\"data/rows.csv\"}}\r\n---\r\nBody", "csv").as_deref(), Some("data/rows.csv"));
    }

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
            .set_len(MAX_CSV_BYTES + 1)
            .unwrap();
        assert!(read(large).unwrap().content.is_none());
    }
    #[test]
    fn scans_nested_templates_but_ignores_hidden_and_unrelated_files() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        for dir in ["nested", ".private"] {
            std::fs::create_dir(root.join(dir)).unwrap();
        }
        for file in [
            "welcome.vf",
            "nested/welcome.veraflow",
            "nested/rows.csv",
            ".private/hidden.vf",
            ".hidden.vf",
        ] {
            std::fs::write(root.join(file), "Hello").unwrap();
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&root, root.join("cycle")).unwrap();
        assert_eq!(
            scan_folder(&root).unwrap(),
            [
                PathBuf::from("nested").join("welcome.veraflow"),
                PathBuf::from("welcome.vf")
            ]
        );
    }
}

#[derive(Default)]
pub struct OpenFolder(Mutex<Option<SelectedFolder>>);

struct SelectedFolder {
    root: PathBuf,
    files: Vec<PathBuf>,
}

#[derive(Serialize)]
pub struct FolderListing {
    name: String,
    files: Vec<String>,
}

fn scan_folder(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut pending = vec![(root.to_owned(), 0)];
    let mut files = Vec::new();
    let mut count = 0;
    while let Some((dir, depth)) = pending.pop() {
        // Directory links such as Windows junctions must not escape the chosen root.
        let resolved = dir.canonicalize().map_err(|_| "folderReadFailed")?;
        if !resolved.starts_with(root) || resolved != dir {
            continue;
        }
        for item in std::fs::read_dir(&resolved).map_err(|_| "folderReadFailed")? {
            let item = item.map_err(|_| "folderReadFailed")?;
            count += 1;
            if count > 20_000 || files.len() >= 2_000 {
                return Err("folderTooLarge".into());
            }
            if item.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let kind = item.file_type().map_err(|_| "folderReadFailed")?;
            let path = item.path();
            if kind.is_dir() {
                if depth >= 24 {
                    return Err("folderTooLarge".into());
                }
                pending.push((path, depth + 1));
            } else if kind.is_file() && format(&path) == Some("source") {
                files.push(
                    path.strip_prefix(root)
                        .map_err(|_| "folderReadFailed")?
                        .to_owned(),
                );
            }
        }
    }
    files.sort();
    Ok(files)
}

fn load_folder(app: &tauri::AppHandle, root: PathBuf) -> Result<FolderListing, String> {
    let files = scan_folder(&root)?;
    let listing = FolderListing {
        name: root
            .file_name()
            .unwrap_or(root.as_os_str())
            .to_string_lossy()
            .into_owned(),
        files: files
            .iter()
            .map(|path| {
                path.iter()
                    .map(|part| part.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/")
            })
            .collect(),
    };
    *app.state::<OpenFolder>()
        .0
        .lock()
        .map_err(|_| "folderReadFailed")? = Some(SelectedFolder { root, files });
    Ok(listing)
}

#[tauri::command]
pub async fn pick_template_folder(app: tauri::AppHandle) -> Result<Option<FolderListing>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let root = folder
            .into_path()
            .map_err(|_| "folderReadFailed")?
            .canonicalize()
            .map_err(|_| "folderReadFailed")?;
        load_folder(&app, root).map(Some)
    })
    .await
    .map_err(|_| "folderReadFailed".to_string())?
}

#[tauri::command]
pub async fn refresh_template_folder(app: tauri::AppHandle) -> Result<FolderListing, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app
            .state::<OpenFolder>()
            .0
            .lock()
            .map_err(|_| "folderReadFailed")?
            .as_ref()
            .map(|folder| folder.root.clone())
            .ok_or("folderReadFailed")?;
        load_folder(&app, root)
    })
    .await
    .map_err(|_| "folderReadFailed".to_string())?
}

#[tauri::command]
pub async fn open_folder_template(app: tauri::AppHandle, index: usize) -> Result<Document, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (root, relative) = {
            let folder = app.state::<OpenFolder>();
            let folder = folder.0.lock().map_err(|_| "folderReadFailed")?;
            let selected = folder.as_ref().ok_or("folderReadFailed")?;
            (
                selected.root.clone(),
                selected.files.get(index).ok_or("recentMissing")?.clone(),
            )
        };
        // Recheck containment in case the file moved or became a link after scanning.
        let path = root
            .join(relative)
            .canonicalize()
            .map_err(|_| "recentMissing")?;
        if !path.starts_with(root) || format(&path) != Some("source") {
            return Err("recentMissing".into());
        }
        open(&app, path).ok_or_else(|| "recentMissing".into())
    })
    .await
    .map_err(|_| "folderReadFailed".to_string())?
}
