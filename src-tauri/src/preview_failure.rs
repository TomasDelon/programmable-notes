//! A dead document renderer must not leave an apparently connected preview shell.
use std::sync::{Arc, Once};
use tauri::{Manager, WebviewWindow};
use webkit2gtk::{WebProcessTerminationReason, WebViewExt};

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    install_once(window, Arc::new(Once::new()))
}

pub fn install_once(window: &WebviewWindow, installed: Arc<Once>) -> tauri::Result<()> {
    let app = window.app_handle().clone();
    window.with_webview(move |platform| {
        install_on_webview(&platform.inner(), app, &installed);
    })
}

pub fn install_on_webview(webview: &webkit2gtk::WebView, app: tauri::AppHandle, installed: &Once) {
    installed.call_once(|| {
        webview.connect_web_process_terminated(move |_, reason| {
            if reason == WebProcessTerminationReason::TerminatedByApi {
                return;
            }
            // Only this unprivileged process exits. systemd still owns its full
            // subtree and the editor retains Stop and explicit rebuild authority.
            eprintln!("NATIVE_PREVIEW_RENDERER_STOPPED reason={reason:?}");
            app.exit(1);
        });
    });
}
