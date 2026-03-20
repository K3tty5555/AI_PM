use serde::Serialize;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use tokio::time::timeout;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub version: String,
    pub notes: String,
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let updater = app
        .updater()
        .map_err(|e| e.to_string())?;

    let result = timeout(Duration::from_secs(15), updater.check())
        .await
        .map_err(|_| "检查更新超时，请检查网络连接".to_string())?;

    match result {
        Ok(Some(update)) => Ok(UpdateInfo {
            available: true,
            version: update.version.clone(),
            notes: update.body.clone().unwrap_or_default(),
        }),
        Ok(None) => Ok(UpdateInfo {
            available: false,
            version: String::new(),
            notes: String::new(),
        }),
        Err(e) => Err(format!("检查更新失败: {e}")),
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| e.to_string())?;

    let update = timeout(Duration::from_secs(15), updater.check())
        .await
        .map_err(|_| "检查更新超时，请检查网络连接".to_string())?
        .map_err(|e| format!("检查更新失败: {e}"))?
        .ok_or_else(|| "当前已是最新版本".to_string())?;

    // 5 minutes timeout for download
    timeout(
        Duration::from_secs(300),
        update.download_and_install(|_chunk, _total| {}, || {}),
    )
    .await
    .map_err(|_| "下载超时，请检查网络连接或前往 GitHub Releases 手动下载".to_string())?
    .map_err(|e| format!("下载失败: {e}"))
}
