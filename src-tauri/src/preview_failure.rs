//! A dead document renderer must not leave an apparently connected preview shell.
use tauri::{Manager, WebviewWindow};
use webkit2gtk::{WebProcessTerminationReason, WebViewExt};

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let app = window.app_handle().clone();
    window.with_webview(move |platform| {
        platform
            .inner()
            .connect_web_process_terminated(move |_, reason| {
                if reason == WebProcessTerminationReason::TerminatedByApi {
                    return;
                }
                // Only this unprivileged process exits. systemd still owns its full
                // subtree and the editor retains Stop and explicit rebuild authority.
                eprintln!("NATIVE_PREVIEW_RENDERER_STOPPED reason={reason:?}");
                app.exit(1);
            });
    })
}
