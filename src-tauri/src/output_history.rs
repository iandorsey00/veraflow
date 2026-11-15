use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{BufWriter, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MAX_COUNT: u8 = 20;
const MAX_FILE_BYTES: usize = 32 * 1024 * 1024;
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize)]
struct Entry {
    title: String,
    time: u64,
    text: String,
}

#[derive(Serialize)]
pub struct OutputLabel {
    title: String,
    time: u64,
}

fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("output-history.json"))
        .map_err(|_| "storageFailed".into())
}

fn read(path: &Path) -> Result<Vec<Entry>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("storageFailed".into()),
    };
    let mut bytes = Vec::new();
    file.take((MAX_FILE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "storageFailed")?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err("storageFailed".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "storageFailed".into())
}

fn write(path: &Path, entries: &[Entry]) -> Result<(), String> {
    if entries.is_empty() {
        return match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("storageFailed".into()),
        };
    }
    let dir = path.parent().ok_or("storageFailed")?;
    std::fs::create_dir_all(dir).map_err(|_| "storageFailed")?;
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|_| "storageFailed")?;
    {
        let mut writer = BufWriter::new(&mut temp);
        serde_json::to_writer(&mut writer, entries).map_err(|_| "storageFailed")?;
        writer.flush().map_err(|_| "storageFailed")?;
    }
    if temp
        .as_file()
        .metadata()
        .map_err(|_| "storageFailed")?
        .len()
        > MAX_FILE_BYTES as u64
    {
        return Err("historyFull".into());
    }
    temp.as_file().sync_all().map_err(|_| "storageFailed")?;
    temp.persist(path).map_err(|_| "storageFailed")?;
    Ok(())
}

fn add(path: &Path, entry: Entry, limit: u8) -> Result<(), String> {
    if limit == 0 || limit > MAX_COUNT {
        return Err("invalidHistoryLimit".into());
    }
    // The encoded history also has a size ceiling. Keep the newest outputs.
    let mut bytes = serde_json::to_vec(&entry)
        .map_err(|_| "storageFailed")?
        .len()
        + 2;
    if bytes > MAX_FILE_BYTES {
        return Err("historyFull".into());
    }
    let mut entries = read(path)?;
    entries.truncate(usize::from(limit) - 1);
    let keep = entries
        .iter()
        .take_while(|entry| {
            bytes += serde_json::to_vec(entry)
                .map(|data| data.len() + 1)
                .unwrap_or(MAX_FILE_BYTES);
            bytes <= MAX_FILE_BYTES
        })
        .count();
    entries.truncate(keep);
    entries.insert(0, entry);
    write(path, &entries)
}

#[tauri::command]
pub fn list_outputs(app: tauri::AppHandle) -> Result<Vec<OutputLabel>, String> {
    let _lock = LOCK.lock().map_err(|_| "storageFailed")?;
    Ok(read(&path(&app)?)?
        .into_iter()
        .map(|entry| OutputLabel {
            title: entry.title,
            time: entry.time,
        })
        .collect())
}

#[tauri::command]
pub fn read_output(app: tauri::AppHandle, index: usize) -> Result<String, String> {
    let _lock = LOCK.lock().map_err(|_| "storageFailed")?;
    read(&path(&app)?)?
        .into_iter()
        .nth(index)
        .map(|entry| entry.text)
        .ok_or_else(|| "storageFailed".into())
}

#[tauri::command]
pub fn record_output(
    app: tauri::AppHandle,
    title: String,
    text: String,
    limit: u8,
) -> Result<(), String> {
    if text.len() > 16 * 1024 * 1024 {
        return Err("historyFull".into());
    }
    let entry = Entry {
        title: title.chars().take(250).collect(),
        text,
        time: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };
    let _lock = LOCK.lock().map_err(|_| "storageFailed")?;
    add(&path(&app)?, entry, limit)
}

#[tauri::command]
pub fn trim_outputs(app: tauri::AppHandle, limit: u8) -> Result<(), String> {
    if limit > MAX_COUNT {
        return Err("invalidHistoryLimit".into());
    }
    let _lock = LOCK.lock().map_err(|_| "storageFailed")?;
    let path = path(&app)?;
    if limit == 0 {
        return write(&path, &[]);
    }
    let mut entries = read(&path)?;
    if entries.len() > usize::from(limit) {
        entries.truncate(usize::from(limit));
        write(&path, &entries)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_newest_outputs_with_a_fixed_limit_and_can_clear() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("outputs.json");
        for index in 0..7 {
            add(
                &path,
                Entry {
                    title: "Example".into(),
                    time: index,
                    text: format!("Output {index}"),
                },
                5,
            )
            .unwrap();
        }
        let entries = read(&path).unwrap();
        assert_eq!(
            entries
                .into_iter()
                .map(|entry| entry.text)
                .collect::<Vec<_>>(),
            ["Output 6", "Output 5", "Output 4", "Output 3", "Output 2"]
        );
        write(&path, &[]).unwrap();
        assert!(read(&path).unwrap().is_empty());
    }
}
