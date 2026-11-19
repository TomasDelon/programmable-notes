//! No download destination or implicit filesystem writes for untrusted previews.
pub fn deny<R: tauri::Runtime>(_: tauri::Webview<R>, _: tauri::webview::DownloadEvent<'_>) -> bool {
    false
}
