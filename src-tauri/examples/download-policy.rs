//! External Linux/WebKit download-path test, never linked into the desktop binary.
#[cfg(target_os = "linux")]
#[path = "../src/downloads.rs"]
mod downloads;

#[cfg(target_os = "linux")]
fn main() {
    use std::{
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
        time::Duration,
    };
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    use webkit2gtk::{DownloadExt, WebViewExt};

    assert_eq!(
        std::env::var("NATIVE_DISPOSABLE_PROFILE").as_deref(),
        Ok("1")
    );
    let url = std::env::args()
        .nth(1)
        .expect("synthetic loopback download URL");
    let parsed = tauri::Url::parse(&url).expect("valid loopback URL");
    assert_eq!(parsed.scheme(), "http");
    assert_eq!(parsed.host_str(), Some("127.0.0.1"));
    assert!(parsed.username().is_empty() && parsed.password().is_none());
    assert!(parsed.port().is_some());
    let mode = std::env::args().nth(2).expect("default or deny");
    assert!(matches!(mode.as_str(), "default" | "deny"));
    let completed = Arc::new(AtomicBool::new(false));
    let complete = completed.clone();
    let app = tauri::Builder::default().setup(move |app| {
        let mut builder = WebviewWindowBuilder::new(app, "download-probe", WebviewUrl::App("native-preview.html".into()))
            .title("Disposable native download probe")
            .incognito(true);
        if mode == "deny" {
            builder = builder.on_download(|view, event| {
                let requested = matches!(&event, tauri::webview::DownloadEvent::Requested { .. });
                let allowed = downloads::deny(view, event);
                if requested && !allowed {eprintln!("DOWNLOAD_DENIED");}
                allowed
            });
        }
        let window = builder.build()?;
        let handle = app.handle().clone();
        window.with_webview(move |platform| {
            let download = platform.inner().download_uri(&url).expect("WebKit download object");
            download.connect_failed(|_, error| eprintln!("DOWNLOAD_FAILED {}", error));
            download.connect_finished(move |download| {
                println!("DOWNLOAD_RESULT {}", serde_json::json!({"destination":download.destination().map(|s|s.to_string())}));
                complete.store(true, Ordering::SeqCst);
                handle.exit(0);
            });
        })?;
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(15));
            if !completed.load(Ordering::SeqCst) {handle.exit(2);}
        });
        Ok(())
    }).build(tauri::generate_context!()).expect("download probe app");
    app.run(|_, _| {});
}
#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("NOT RUN: requires Linux WebKitGTK");
    std::process::exit(2);
}
