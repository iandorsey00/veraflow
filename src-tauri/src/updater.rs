use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

pub static INSTALLING: AtomicBool = AtomicBool::new(false);
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    notes: String,
}
#[derive(Clone, serde::Serialize)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum Progress {
    Downloading { downloaded: u64, total: Option<u64> },
    Installing,
}
struct InstallGuard;
impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::SeqCst);
    }
}

fn trusted_download(url: &tauri::Url, version: &str) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.path().starts_with(&format!(
            "/iandorsey00/veraflow/releases/download/v{}/VeraFlow_",
            version
        ))
}

#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    if INSTALLING.load(Ordering::SeqCst) {
        return Err("updateBusy".into());
    }
    *pending.0.lock().map_err(|_| "updateFailed")? = None;
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "updateCheckFailed")?
        .check()
        .await
        .map_err(|_| "updateCheckFailed")?;
    let Some(update) = update else {
        return Ok(None);
    };
    if !trusted_download(&update.download_url, &update.version) {
        return Err("updateCheckFailed".into());
    }
    let info = UpdateInfo {
        version: update.version.clone(),
        notes: update
            .body
            .clone()
            .unwrap_or_default()
            .chars()
            .take(12000)
            .collect(),
    };
    *pending.0.lock().map_err(|_| "updateFailed")? = Some(update);
    Ok(Some(info))
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    progress: Channel<Progress>,
) -> Result<(), String> {
    if super::EXIT_GUARD.load(Ordering::SeqCst) {
        return Err("updateBusy".into());
    }
    INSTALLING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "updateBusy")?;
    let _guard = InstallGuard;
    let update = pending
        .0
        .lock()
        .map_err(|_| "updateFailed")?
        .take()
        .ok_or("updateCheckFailed")?;
    let mut downloaded = 0u64;
    // download() verifies the embedded-key signature before returning any installable bytes.
    let bytes = update
        .download(
            |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                let _ = progress.send(Progress::Downloading { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|_| "updateDownloadFailed")?;
    if super::EXIT_GUARD.load(Ordering::SeqCst) {
        return Err("updateBusy".into());
    }
    let _ = progress.send(Progress::Installing);
    tauri::async_runtime::spawn_blocking(move || update.install(bytes))
        .await
        .map_err(|_| "updateInstallFailed")?
        .map_err(|_| "updateInstallFailed")?;
    // Windows exits through the installer; macOS needs an explicit restart.
    drop(_guard);
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_source_is_https_and_bound_to_repo_and_version() {
        let good = "https://github.com/iandorsey00/veraflow/releases/download/v0.5.0/VeraFlow_v0.5.0_windows-x64-setup.exe";
        assert!(trusted_download(&good.parse().unwrap(), "0.5.0"));
        assert!(!trusted_download(&good.parse().unwrap(), "0.6.0"));
        for bad in [
            good.replace("https:", "http:"),
            good.replace("github.com/", "github.com.evil.example/"),
            good.replace("iandorsey00/", "someone/"),
            good.replace("github.com/", "user@github.com/"),
        ] {
            assert!(!trusted_download(&bad.parse().unwrap(), "0.5.0"));
        }
    }
}
