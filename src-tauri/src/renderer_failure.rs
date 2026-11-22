//! Native editor failure feedback. Never install on the unprivileged preview.
use crate::documents::{Dialog, Documents};
use std::{cell::Cell, sync::Arc, thread, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use webkit2gtk::{WebProcessTerminationReason, WebViewExt};

fn show_after_current_dialog(app: AppHandle, parent: WebviewWindow) {
    let docs = app.state::<Arc<Documents>>().inner().clone();
    let label = parent.label().to_owned();
    // One pending task per failed window. Existing native dialogs can complete
    // without a renderer; never cancel their authorization flow automatically.
    tauri::async_runtime::spawn_blocking(move || loop {
        if app.get_webview_window(&label).is_none() {
            return;
        }
        if let Ok(dialog) = Dialog::acquire(&docs) {
            let show = app.clone();
            if let Err(error) = app.run_on_main_thread(move || {
                if show.get_webview_window(&label).is_none() {
                    return;
                }
                let quit = show.clone();
                show.dialog()
                    .message("The editor stopped unexpectedly. Close and reopen the app, then check Recovery for saved drafts. Recent unsaved changes may be unavailable.")
                    .title("Editor stopped")
                    .parent(&parent)
                    .kind(MessageDialogKind::Error)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Quit editor".into(),
                        "Keep window open".into(),
                    ))
                    .show(move |confirmed| {
                        let _dialog = dialog;
                        if confirmed {
                            // Explicit warned force-quit. Existing atomic-write
                            // and recovery interruption rules still apply.
                            quit.exit(1);
                        }
                    });
            }) {
                eprintln!("NATIVE_EDITOR_FAILURE_NOTICE_UNAVAILABLE {error}");
            }
            return;
        }
        thread::sleep(Duration::from_millis(200));
    });
}

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let parent = window.clone();
    let app = window.app_handle().clone();
    window.with_webview(move |platform| {
        let notified = Cell::new(false);
        platform
            .inner()
            .connect_web_process_terminated(move |_, reason| {
                if reason == WebProcessTerminationReason::TerminatedByApi {
                    return;
                }
                crate::documents::editor_renderer_stopped(&app);
                if notified.replace(true) {
                    return;
                }
                eprintln!("NATIVE_EDITOR_RENDERER_STOPPED reason={reason:?}");
                show_after_current_dialog(app.clone(), parent.clone());
            });
    })
}
