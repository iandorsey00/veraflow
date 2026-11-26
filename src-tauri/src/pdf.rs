// Desktop PDF save panel and machine-local tool settings.
mod converter;
use converter::{executable, read_settings, verify_tool, Destination, Tool, Tools, MARKDOWN_LIMIT};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{ipc::Channel, Manager};
use tauri_plugin_dialog::DialogExt;

static ACTIVE: Mutex<()> = Mutex::new(());
static CANCELLED: AtomicBool = AtomicBool::new(false);
static SETTINGS: Mutex<()> = Mutex::new(());
static APPROVED_TOOLS: Mutex<Tools> = Mutex::new(Tools {
    pandoc: None,
    xelatex: None,
});

#[derive(Serialize)]
pub struct ToolSetup {
    tools: Tools,
    configured: bool,
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("pdf-tools.json"))
        .map_err(|_| "storageFailed")
}

fn write_settings(path: &Path, tools: &Tools) -> Result<(), &'static str> {
    let dir = path.parent().ok_or("storageFailed")?;
    fs::create_dir_all(dir).map_err(|_| "storageFailed")?;
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|_| "storageFailed")?;
    serde_json::to_writer(&mut temp, tools).map_err(|_| "storageFailed")?;
    temp.as_file().sync_all().map_err(|_| "storageFailed")?;
    temp.persist(path).map_err(|_| "storageFailed")?;
    Ok(())
}

#[tauri::command]
pub async fn pdf_tools(app: tauri::AppHandle) -> Result<ToolSetup, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<_, &'static str> {
        let _guard = SETTINGS.lock().map_err(|_| "storageFailed")?;
        let (tools, configured) = read_settings(&settings_path(&app)?)?.discover();
        *APPROVED_TOOLS.lock().map_err(|_| "storageFailed")? = tools.clone();
        Ok(ToolSetup { tools, configured })
    })
    .await
    .map_err(|_| "storageFailed".to_string())?
    .map_err(str::to_owned)
}

#[tauri::command]
pub async fn pick_pdf_tool(app: tauri::AppHandle, tool: Tool) -> Result<Option<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<_, &'static str> {
        let Some(file) = app
            .dialog()
            .file()
            .set_title(tool.name())
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|_| tool.missing())?;
        if !verify_tool(&path, tool) {
            return Err(tool.missing());
        }
        *tool.path(&mut *APPROVED_TOOLS.lock().map_err(|_| "storageFailed")?) = Some(path.clone());
        Ok(Some(path))
    })
    .await
    .map_err(|_| "storageFailed".to_string())?
    .map_err(str::to_owned)
}

#[tauri::command]
pub async fn configure_pdf(app: tauri::AppHandle, tools: Tools) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<_, &'static str> {
        let mut tools = tools;
        {
            let mut approved = APPROVED_TOOLS.lock().map_err(|_| "storageFailed")?;
            for tool in [Tool::Pandoc, Tool::Xelatex] {
                let path = tool.path(&mut tools).as_deref().ok_or(tool.missing())?;
                if tool.path(&mut approved).as_deref() != Some(path) || !executable(path, tool) {
                    return Err(tool.missing());
                }
            }
        }
        let _guard = SETTINGS.lock().map_err(|_| "storageFailed")?;
        write_settings(&settings_path(&app)?, &tools)
    })
    .await
    .map_err(|_| "storageFailed".to_string())?
    .map_err(str::to_owned)
}

#[tauri::command]
pub fn cancel_pdf() {
    CANCELLED.store(true, Ordering::Release);
}

#[tauri::command]
pub async fn save_pdf(
    app: tauri::AppHandle,
    markdown: String,
    filename: String,
    progress: Channel<()>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<_, &'static str> {
        let _active = ACTIVE.try_lock().map_err(|_| "pdfBusy")?;
        CANCELLED.store(false, Ordering::Release);
        if markdown.is_empty() || markdown.len() > MARKDOWN_LIMIT {
            return Err("pdfMarkdownLimit");
        }
        let tools = read_settings(&settings_path(&app)?)?;
        tools.executables()?;
        let filename = filename
            .strip_suffix(".pdf")
            .filter(|stem| {
                !stem.is_empty()
                    && stem.len() <= 280
                    && stem
                        .chars()
                        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_'))
            })
            .map(|stem| format!("{stem}.pdf"))
            .unwrap_or_else(|| "VeraFlow.pdf".into());
        let Some(file) = app
            .dialog()
            .file()
            .set_file_name(filename)
            .add_filter("PDF", &["pdf"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|_| "pdfDestination")?;
        // The native save panel confirms replacement before returning an existing path.
        let destination = Destination::new(path, true)?;
        if progress.send(()).is_err() {
            return Err("pdfCancelled");
        }
        destination.save(&markdown, &tools, &CANCELLED)?;
        Ok(true)
    })
    .await
    .map_err(|_| "pdfConvertFailed".to_string())?
    .map_err(str::to_owned)
}
