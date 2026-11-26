#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod documents;
mod downloads;
#[cfg(target_os = "linux")]
mod preview_failure;
#[cfg(target_os = "linux")]
mod renderer_failure;
mod updates;
use documents::{
    close_document, confirm_discard, open_documents, open_notes_folder, recovery_draft,
    reopen_document, save_document, save_document_as, set_documents_dirty,
};
use preview_policy::{authorize, Supervisor, MAX_HTML_BYTES};
use std::{
    io::{self, Read},
    sync::Mutex,
};
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct Host {
    child: bool,
    supervisor: std::sync::Arc<Mutex<Supervisor>>,
}
#[tauri::command]
fn host_probe(
    window: WebviewWindow,
    state: tauri::State<'_, Host>,
) -> Result<&'static str, String> {
    authorize(window.label(), state.child)?;
    Ok("editor-host-only") // A positive control for actual registered-command ACL denial tests.
}
#[tauri::command]
async fn start_preview(
    window: WebviewWindow,
    state: tauri::State<'_, Host>,
    html: String,
) -> Result<String, String> {
    authorize(window.label(), state.child)?;
    if !cfg!(feature = "custom-protocol") {
        return Err("Native preview requires an embedded-asset build; tauri dev cannot cross the private network boundary".into());
    }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let supervisor = state.supervisor.clone();
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut supervisor = supervisor
            .lock()
            .map_err(|_| "Supervisor poisoned".to_string())?;
        if app
            .try_state::<updates::Updates>()
            .is_some_and(|updates| updates.installing.load(std::sync::atomic::Ordering::SeqCst))
        {
            return Err("Preview cannot start while an update is installing".into());
        }
        supervisor.start(&executable, &html)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn stop_preview(window: WebviewWindow, state: tauri::State<'_, Host>) -> Result<(), String> {
    authorize(window.label(), state.child)?;
    let supervisor = state.supervisor.clone();
    tauri::async_runtime::spawn_blocking(move || {
        supervisor
            .lock()
            .map_err(|_| "Supervisor poisoned".to_string())?
            .stop()
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn preview_connection_active(
    window: WebviewWindow,
    state: tauri::State<'_, Host>,
) -> Result<bool, String> {
    authorize(window.label(), state.child)?;
    let supervisor = state.supervisor.clone();
    tauri::async_runtime::spawn_blocking(move || {
        supervisor
            .lock()
            .map_err(|_| "Supervisor poisoned".to_string())?
            .connection_active()
    })
    .await
    .map_err(|e| e.to_string())?
}
fn allowed_navigation(url: &tauri::Url) -> bool {
    let local = matches!(
        (url.scheme(), url.host_str(), url.port()),
        ("tauri", Some("localhost"), None) | ("http" | "https", Some("tauri.localhost"), None)
    ) || (!cfg!(feature = "custom-protocol")
        && url.as_str().starts_with("http://127.0.0.1:5173/"));
    matches!(url.as_str(), "about:srcdoc" | "about:blank")
        || (local
            && matches!(
                url.path(),
                "" | "/" | "/index.html" | "/native-preview.html"
            ))
}

fn main() {
    let child = std::env::args().any(|arg| arg == "--preview-child");
    // The test-only preview shell lets WebDriver invoke registered commands directly.
    // It cannot grant capabilities or bypass the production authorization function.
    let probe =
        cfg!(feature = "security-test") && std::env::args().any(|arg| arg == "--security-probe");
    let editor_probe =
        cfg!(feature = "security-test") && std::env::args().any(|arg| arg == "--security-editor");
    let child = child || probe;
    let html = if child && !probe {
        let mut text = String::new();
        io::stdin()
            .take((MAX_HTML_BYTES + 1) as u64)
            .read_to_string(&mut text)
            .expect("Invalid preview input");
        assert!(text.len() <= MAX_HTML_BYTES, "Preview input too large");
        Some(text)
    } else {
        None
    };
    let mut context = tauri::generate_context!();
    if child {
        // This unprivileged shell uses its own static navigation/network CSP plus
        // the inner artifact's hash CSP. Inheriting the editor's script-src would
        // forbid every dynamically compiled document hash in srcdoc.
        context.config_mut().app.security.csp = None;
        context.config_mut().app.security.dev_csp = None;
    }
    let mut builder = tauri::Builder::default()
        .manage(Host {
            child,
            supervisor: std::sync::Arc::new(Mutex::new(Supervisor::default())),
        })
        .manage(updates::Updates::default())
        .invoke_handler(tauri::generate_handler![
            start_preview,
            stop_preview,
            preview_connection_active,
            host_probe,
            open_documents,
            open_notes_folder,
            save_document,
            save_document_as,
            reopen_document,
            close_document,
            confirm_discard,
            set_documents_dirty,
            recovery_draft,
            updates::desktop_update_check,
            updates::desktop_update_install
        ]);
    if !child {
        builder = builder
            .plugin(tauri_plugin_dialog::init())
            .plugin(updates::plugin())
            .manage(std::sync::Arc::new(documents::Documents::default()))
            .on_window_event(documents::close_requested);
    }
    let app=builder
        .setup(move |app| {
            let label=if child {"preview"} else {"editor"};
            let url=WebviewUrl::App(if child || editor_probe {"native-preview.html"} else {"index.html"}.into());
            let mut builder=WebviewWindowBuilder::new(app,label,url)
                .title(if child {"Unprivileged document preview"} else {"Programmable Notes"})
                .disable_drag_drop_handler()
                // Rebuilding untrusted output must not take source typing focus.
                // The user can still explicitly activate and interact with it.
                .focused(!child)
                .incognito(child)
                .on_navigation(allowed_navigation);
            if child {
                // Native download handling is independent of IPC and iframe permissions.
                builder=builder.on_download(downloads::deny);
            }
            if let Some(html)=html.as_ref() {
                let value=serde_json::to_string(html)?;
                // The value is serialized data; it is never evaluated as document JavaScript in this shell.
                builder=builder.initialization_script(format!("addEventListener('DOMContentLoaded',()=>{{document.querySelector('iframe').srcdoc={value};}},{{once:true}});"));
            }
            let _window = builder.build()?;
            #[cfg(target_os = "linux")]
            if child {
                preview_failure::install(&_window)?;
            } else {
                renderer_failure::install(&_window)?;
            }
            Ok(())
        })
        .build(context).expect("Failed to start native runtime");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Ok(mut supervisor) = app.state::<Host>().supervisor.lock() {
                let _ = supervisor.stop();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn embedded_root_navigation_and_boundary() {
        for url in [
            "tauri://localhost",
            "tauri://localhost/",
            "tauri://localhost/index.html",
            "tauri://localhost/native-preview.html",
            "http://tauri.localhost/",
            "about:srcdoc",
            "about:blank",
        ] {
            assert!(
                allowed_navigation(&tauri::Url::parse(url).unwrap()),
                "Rejected embedded root: {url}"
            );
        }
        for url in [
            "https://example.com/",
            "tauri://evil/index.html",
            "tauri://localhost:1234/",
            "http://tauri.localhost.evil/",
            "http://127.0.0.1:9999/",
            "tauri://localhost/assets/author.js",
            "file:///etc/passwd",
            "javascript:alert(1)",
        ] {
            assert!(
                !allowed_navigation(&tauri::Url::parse(url).unwrap()),
                "Allowed external/unlisted navigation: {url}"
            );
        }
    }
}
