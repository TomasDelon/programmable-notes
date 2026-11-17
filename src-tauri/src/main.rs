#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use preview_policy::{authorize, Supervisor, MAX_HTML_BYTES};
use std::{
    io::{self, Read},
    sync::Mutex,
};
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct Host {
    child: bool,
    supervisor: Mutex<Supervisor>,
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
    // Blocking supervisor operations never run on the WebKit/UI thread.
    state
        .supervisor
        .lock()
        .map_err(|_| "Supervisor poisoned")?
        .start(&executable, &html)
}
#[tauri::command]
async fn stop_preview(window: WebviewWindow, state: tauri::State<'_, Host>) -> Result<(), String> {
    authorize(window.label(), state.child)?;
    state
        .supervisor
        .lock()
        .map_err(|_| "Supervisor poisoned")?
        .stop()
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
    let app=tauri::Builder::default()
        .manage(Host{child,supervisor:Mutex::new(Supervisor::default())})
        .invoke_handler(tauri::generate_handler![start_preview,stop_preview,host_probe])
        .setup(move |app| {
            let label=if child {"preview"} else {"editor"};
            let url=WebviewUrl::App(if child || editor_probe {"native-preview.html"} else {"index.html"}.into());
            let mut builder=WebviewWindowBuilder::new(app,label,url)
                .title(if child {"Unprivileged document preview"} else {"Programmable Notes"})
                .disable_drag_drop_handler()
                .incognito(child)
                .on_navigation(|url| {
                    let local=matches!((url.scheme(),url.host_str(),url.port()),
                        ("tauri",Some("localhost"),None) | ("http"|"https",Some("tauri.localhost"),None))
                        || (!cfg!(feature="custom-protocol") && url.as_str().starts_with("http://127.0.0.1:5173/"));
                    matches!(url.as_str(),"about:srcdoc"|"about:blank") || (local && matches!(url.path(),"/"|"/index.html"|"/native-preview.html"))
                });
            if let Some(html)=html.as_ref() {
                let value=serde_json::to_string(html)?;
                // The value is serialized data; it is never evaluated as document JavaScript in this shell.
                builder=builder.initialization_script(format!("addEventListener('DOMContentLoaded',()=>{{document.querySelector('iframe').srcdoc={value};}},{{once:true}});"));
            }
            builder.build()?;
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
